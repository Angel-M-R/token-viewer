import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { lstat, mkdir, realpath, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  SNAPSHOT_SCHEMA_VERSION,
  UNKNOWN_DIMENSION,
  allowedMachineSchema,
  type AllowedMachine,
  type DailySnapshot,
  type HourlyUsageRow,
  type SanitizedQuotaSample,
  type SnapshotTotals,
} from "../../packages/core/src/snapshots.js";
import {
  canonicalDailySnapshotPath,
  writeDailySnapshotAtomic,
} from "../../packages/core/src/snapshot-generation.js";
import { validateSnapshotDirectory } from "../../packages/core/src/snapshot-files.js";

const METRICS = [
  "requests",
  "inputTokens",
  "outputTokens",
  "reasoningTokens",
  "cacheReadTokens",
  "cacheWriteTokens",
  "estimatedCost",
  "billedCost",
  "unpricedRequests",
] as const;

type Metric = (typeof METRICS)[number];

const LEGACY_MACHINES = ["angel-mac", "old-mac"] as const;
type LegacyMachine = (typeof LEGACY_MACHINES)[number];

interface LegacyUsageAggregate extends HourlyUsageRow {
  date: string;
}

interface LegacyQuotaAggregate extends SanitizedQuotaSample {
  date: string;
}

export interface LegacyAggregateSet {
  machine: AllowedMachine;
  usage: readonly LegacyUsageAggregate[];
  quotas: readonly LegacyQuotaAggregate[];
  duplicateUsageRecords: number;
  duplicateQuotaSamples: number;
}

export interface ImportLegacySnapshotsOptions {
  databasePath: string;
  repositoryRoot: string;
  machine: AllowedMachine;
  generatedAt?: Date;
}

export interface ImportLegacySnapshotsResult {
  machine: AllowedMachine;
  importedDates: readonly string[];
  existingDates: readonly string[];
  usageRows: number;
  quotaSamples: number;
  duplicateUsageRecords: number;
  duplicateQuotaSamples: number;
}

export interface EquivalenceDifference {
  classification: "overlap-mismatch" | "expected-addition";
  scope: "usage" | "quota";
  machine: LegacyMachine;
  date: string;
  agent: string | null;
  provider: string;
  model: string | null;
  metric: string;
  sqlite: number | string | null;
  snapshot: number | string | null;
  explanation:
    | "Unresolved overlap mismatch; review required."
    | "Expected snapshot-only addition outside legacy coverage.";
}

export interface DateCoverage {
  firstDate: string;
  lastDate: string;
}

export interface MachineEquivalenceCoverage {
  machine: LegacyMachine;
  sqlite: DateCoverage | null;
  snapshot: DateCoverage | null;
  overlap: DateCoverage | null;
}

export interface EquivalenceResult {
  generatedAt: string;
  machines: readonly LegacyMachine[];
  coverage: readonly MachineEquivalenceCoverage[];
  differences: readonly EquivalenceDifference[];
  expectedAdditions: readonly EquivalenceDifference[];
  report: string;
}

export class LegacyMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LegacyMigrationError";
  }
}

const DEDUPED_USAGE_CTE = `
  WITH selected_usage AS (
    SELECT u.*
    FROM usage_records u
    JOIN machines m ON m.id = u.machine_id
    WHERE m.name = ?
  ), deduped_usage AS (
    SELECT u.*
    FROM selected_usage u
    JOIN (
      SELECT MIN(id) AS id
      FROM selected_usage
      GROUP BY record_hash
    ) first_record ON first_record.id = u.id
  )
`;

const DEDUPED_QUOTA_CTE = `
  WITH selected_quota AS (
    SELECT q.*
    FROM quota_snapshots q
    JOIN machines m ON m.id = q.machine_id
    WHERE m.name = ?
  ), deduped_quota AS (
    SELECT q.*
    FROM selected_quota q
    JOIN (
      SELECT MAX(id) AS id
      FROM selected_quota
      GROUP BY provider, taken_at
    ) latest_sample ON latest_sample.id = q.id
  )
`;

export function readLegacyAggregates(databasePath: string, machineInput: AllowedMachine): LegacyAggregateSet {
  const machine = allowedMachineSchema.parse(machineInput);
  const database = openImmutableDatabase(databasePath);
  try {
    assertLegacySchema(database);
    assertMachineExists(database, machine);
    assertValidLegacyUsage(database, machine);
    assertValidLegacyQuota(database, machine);

    const usage = queryRows(database, `${DEDUPED_USAGE_CTE}
      SELECT
        strftime('%Y-%m-%d', ts) AS date,
        strftime('%Y-%m-%dT%H:00:00.000Z', ts) AS hour,
        trim(agent) AS agent,
        COALESCE(NULLIF(trim(provider), ''), '${UNKNOWN_DIMENSION}') AS provider,
        COALESCE(NULLIF(trim(model), ''), '${UNKNOWN_DIMENSION}') AS model,
        COUNT(*) AS requests,
        SUM(input_tokens) AS inputTokens,
        SUM(output_tokens) AS outputTokens,
        SUM(reasoning_tokens) AS reasoningTokens,
        SUM(cache_read_tokens) AS cacheReadTokens,
        SUM(cache_write_tokens) AS cacheWriteTokens,
        SUM(COALESCE(cost_usd, 0)) AS estimatedCost,
        SUM(COALESCE(billed_cost_usd, 0)) AS billedCost,
        SUM(CASE WHEN cost_usd IS NULL THEN 1 ELSE 0 END) AS unpricedRequests
      FROM deduped_usage
      GROUP BY date, hour, agent, provider, model
      ORDER BY date, hour, agent, provider, model
    `, machine).map(parseUsageAggregate);

    const quotas = queryRows(database, `${DEDUPED_QUOTA_CTE}
      SELECT
        strftime('%Y-%m-%d', taken_at) AS date,
        trim(provider) AS provider,
        strftime('%Y-%m-%dT%H:%M:%fZ', taken_at) AS takenAt,
        percent_used AS percentUsed,
        plan,
        CASE WHEN resets_at IS NULL THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ', resets_at) END AS resetsAt
      FROM deduped_quota
      ORDER BY date, takenAt, provider
    `, machine).map(parseQuotaAggregate);

    const usageCounts = queryOne(database, `
      SELECT COUNT(*) AS total, COUNT(DISTINCT u.record_hash) AS uniqueRecords
      FROM usage_records u
      JOIN machines m ON m.id = u.machine_id
      WHERE m.name = ?
    `, machine);
    const quotaCounts = queryOne(database, `
      SELECT COUNT(*) AS total, COUNT(*) - COUNT(DISTINCT provider || char(0) || taken_at) AS duplicates
      FROM quota_snapshots q
      JOIN machines m ON m.id = q.machine_id
      WHERE m.name = ?
    `, machine);

    return {
      machine,
      usage,
      quotas,
      duplicateUsageRecords: integer(usageCounts, "total") - integer(usageCounts, "uniqueRecords"),
      duplicateQuotaSamples: integer(quotaCounts, "duplicates"),
    };
  } catch (error) {
    if (error instanceof LegacyMigrationError) throw error;
    throw new LegacyMigrationError("Legacy SQLite could not be read as the expected aggregate source");
  } finally {
    database.close();
  }
}

export async function importLegacySnapshots(
  options: ImportLegacySnapshotsOptions,
): Promise<ImportLegacySnapshotsResult> {
  const machine = parseLegacyMachine(options.machine);
  const repositoryRoot = await assertOwnedSnapshotFolder(options.repositoryRoot, machine);
  const existingFiles = await validateSnapshotDirectory(join(repositoryRoot, "snapshots"));
  const existingDates = new Set(
    existingFiles.filter((file) => file.machine === machine).map((file) => file.date),
  );
  const legacy = readLegacyAggregates(options.databasePath, machine);
  const usageByDate = groupByDate(legacy.usage);
  const quotaByDate = groupByDate(legacy.quotas);
  const dates = new Set([...usageByDate.keys(), ...quotaByDate.keys()]);
  const generatedAt = options.generatedAt ?? new Date();
  if (!Number.isFinite(generatedAt.getTime())) {
    throw new LegacyMigrationError("generatedAt must be a valid date");
  }

  const importedDates: string[] = [];
  const protectedDates: string[] = [];
  let usageRows = 0;
  let quotaSamples = 0;

  for (const date of [...dates].sort(compareStrings)) {
    if (existingDates.has(date)) {
      protectedDates.push(date);
      continue;
    }
    const usage = [...(usageByDate.get(date) ?? [])].map(({ date: _date, ...row }) => row);
    const quotas = [...(quotaByDate.get(date) ?? [])].map(({ date: _date, ...sample }) => sample);
    const snapshot: DailySnapshot = {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      machine,
      date,
      generatedAt: generatedAt.toISOString(),
      usage,
      quotaSamples: quotas,
      totals: sumMetrics(usage),
    };
    const ownedPath = canonicalDailySnapshotPath(machine, date);
    if (!ownedPath.startsWith(`snapshots/${machine}/`)) {
      throw new LegacyMigrationError("Importer attempted to leave the selected machine folder");
    }
    await writeDailySnapshotAtomic(repositoryRoot, snapshot);
    importedDates.push(date);
    usageRows += usage.length;
    quotaSamples += quotas.length;
  }

  await validateSnapshotDirectory(join(repositoryRoot, "snapshots"));
  return {
    machine,
    importedDates,
    existingDates: protectedDates,
    usageRows,
    quotaSamples,
    duplicateUsageRecords: legacy.duplicateUsageRecords,
    duplicateQuotaSamples: legacy.duplicateQuotaSamples,
  };
}

export async function createEquivalenceReport(options: {
  databasePath: string;
  repositoryRoot: string;
  machines?: readonly AllowedMachine[];
  generatedAt?: Date;
}): Promise<EquivalenceResult> {
  const machines = [...new Set<AllowedMachine>(options.machines ?? LEGACY_MACHINES)].map((machine) =>
    parseLegacyMachine(machine),
  );
  const generatedAt = options.generatedAt ?? new Date();
  if (!Number.isFinite(generatedAt.getTime())) {
    throw new LegacyMigrationError("generatedAt must be a valid date");
  }
  const files = await validateSnapshotDirectory(join(resolve(options.repositoryRoot), "snapshots"));
  const differences: EquivalenceDifference[] = [];
  const expectedAdditions: EquivalenceDifference[] = [];
  const coverage: MachineEquivalenceCoverage[] = [];

  for (const machine of machines) {
    const legacy = readLegacyAggregates(options.databasePath, machine);
    const snapshotFiles = files.filter((file) => file.machine === machine);
    const snapshots = snapshotFiles.map((file) => file.snapshot);
    const sqliteCoverage = coverageForDates([
      ...legacy.usage.map((row) => row.date),
      ...legacy.quotas.map((sample) => sample.date),
    ]);
    const snapshotCoverage = coverageForDates(snapshotFiles.map((file) => file.date));
    const overlap = intersectCoverage(sqliteCoverage, snapshotCoverage);
    coverage.push({ machine, sqlite: sqliteCoverage, snapshot: snapshotCoverage, overlap });

    compareUsage(
      machine,
      legacy.usage.filter((row) => isWithinCoverage(row.date, overlap)),
      snapshots.filter((snapshot) => isWithinCoverage(snapshot.date, overlap)),
      differences,
      "overlap-mismatch",
    );
    compareQuotas(
      machine,
      legacy.quotas.filter((sample) => isWithinCoverage(sample.date, overlap)),
      snapshots.filter((snapshot) => isWithinCoverage(snapshot.date, overlap)),
      differences,
      "overlap-mismatch",
    );

    const additions = snapshots.filter((snapshot) => !isWithinCoverage(snapshot.date, sqliteCoverage));
    compareUsage(machine, [], additions, expectedAdditions, "expected-addition");
    compareQuotas(machine, [], additions, expectedAdditions, "expected-addition");
  }

  differences.sort((left, right) => compareStrings(JSON.stringify(left), JSON.stringify(right)));
  expectedAdditions.sort((left, right) => compareStrings(JSON.stringify(left), JSON.stringify(right)));
  const report = renderEquivalenceReport(
    generatedAt.toISOString(),
    machines,
    coverage,
    differences,
    expectedAdditions,
  );
  return {
    generatedAt: generatedAt.toISOString(),
    machines,
    coverage,
    differences,
    expectedAdditions,
    report,
  };
}

function openImmutableDatabase(databasePath: string): DatabaseSync {
  const immutableUrl = pathToFileURL(resolve(databasePath));
  immutableUrl.searchParams.set("immutable", "1");
  try {
    const database = new DatabaseSync(immutableUrl, { readOnly: true });
    database.exec("PRAGMA query_only = ON; PRAGMA trusted_schema = OFF;");
    const check = database.prepare("PRAGMA quick_check").get() as Record<string, unknown> | undefined;
    if (!check || !Object.values(check).includes("ok")) {
      database.close();
      throw new LegacyMigrationError("Legacy SQLite failed its read-only integrity check");
    }
    return database;
  } catch (error) {
    if (error instanceof LegacyMigrationError) throw error;
    throw new LegacyMigrationError("Legacy SQLite is unavailable for immutable read-only access");
  }
}

function assertLegacySchema(database: DatabaseSync): void {
  const row = queryOne(database, `
    SELECT COUNT(*) AS count
    FROM sqlite_schema
    WHERE type = 'table' AND name IN ('machines', 'usage_records', 'quota_snapshots')
  `);
  if (integer(row, "count") !== 3) {
    throw new LegacyMigrationError("Legacy SQLite does not contain the required migration tables");
  }
}

function assertMachineExists(database: DatabaseSync, machine: AllowedMachine): void {
  const row = queryOne(database, "SELECT COUNT(*) AS count FROM machines WHERE name = ?", machine);
  if (integer(row, "count") !== 1) {
    throw new LegacyMigrationError(`Legacy SQLite has no unique aggregate source for ${machine}`);
  }
}

function assertValidLegacyUsage(database: DatabaseSync, machine: AllowedMachine): void {
  const row = queryOne(database, `${DEDUPED_USAGE_CTE}
    SELECT COUNT(*) AS count
    FROM deduped_usage
    WHERE
      typeof(record_hash) != 'text' OR length(record_hash) = 0 OR
      typeof(agent) != 'text' OR length(trim(agent)) = 0 OR
      strftime('%Y-%m-%dT%H:00:00.000Z', ts) IS NULL OR
      typeof(input_tokens) != 'integer' OR input_tokens < 0 OR
      typeof(output_tokens) != 'integer' OR output_tokens < 0 OR
      typeof(reasoning_tokens) != 'integer' OR reasoning_tokens < 0 OR
      typeof(cache_read_tokens) != 'integer' OR cache_read_tokens < 0 OR
      typeof(cache_write_tokens) != 'integer' OR cache_write_tokens < 0 OR
      (cost_usd IS NOT NULL AND (typeof(cost_usd) NOT IN ('integer', 'real') OR cost_usd < 0 OR cost_usd > 1e308)) OR
      (billed_cost_usd IS NOT NULL AND (typeof(billed_cost_usd) NOT IN ('integer', 'real') OR billed_cost_usd < 0 OR billed_cost_usd > 1e308))
  `, machine);
  const count = integer(row, "count");
  if (count > 0) {
    throw new LegacyMigrationError(`Legacy SQLite contains ${count} malformed usage record(s)`);
  }
}

function assertValidLegacyQuota(database: DatabaseSync, machine: AllowedMachine): void {
  const row = queryOne(database, `${DEDUPED_QUOTA_CTE}
    SELECT COUNT(*) AS count
    FROM deduped_quota
    WHERE
      typeof(provider) != 'text' OR length(trim(provider)) = 0 OR
      strftime('%Y-%m-%dT%H:%M:%fZ', taken_at) IS NULL OR
      (percent_used IS NOT NULL AND (typeof(percent_used) NOT IN ('integer', 'real') OR percent_used < 0 OR percent_used > 100)) OR
      (plan IS NOT NULL AND (typeof(plan) != 'text' OR length(trim(plan)) = 0)) OR
      (resets_at IS NOT NULL AND strftime('%Y-%m-%dT%H:%M:%fZ', resets_at) IS NULL)
  `, machine);
  const count = integer(row, "count");
  if (count > 0) {
    throw new LegacyMigrationError(`Legacy SQLite contains ${count} malformed quota sample(s)`);
  }
}

async function assertOwnedSnapshotFolder(repositoryRootInput: string, machine: AllowedMachine): Promise<string> {
  const repositoryRoot = await realpath(resolve(repositoryRootInput)).catch(() => {
    throw new LegacyMigrationError("Repository root is unavailable");
  });
  const snapshotsRoot = join(repositoryRoot, "snapshots");
  const machineRoot = join(snapshotsRoot, machine);
  await assertNotSymlinkIfPresent(snapshotsRoot, "snapshots root");
  await assertNotSymlinkIfPresent(machineRoot, "selected machine folder");
  const relativeMachineRoot = relative(repositoryRoot, machineRoot);
  if (relativeMachineRoot.startsWith(`..${sep}`) || relativeMachineRoot === ".." || resolve(machineRoot) !== machineRoot) {
    throw new LegacyMigrationError("Selected machine folder is outside the repository root");
  }
  return repositoryRoot;
}

async function assertNotSymlinkIfPresent(path: string, label: string): Promise<void> {
  const info = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw new LegacyMigrationError(`${label} cannot be inspected safely`);
  });
  if (info?.isSymbolicLink()) {
    throw new LegacyMigrationError(`${label} must not be a symbolic link`);
  }
}

function parseUsageAggregate(row: Record<string, unknown>): LegacyUsageAggregate {
  return {
    date: string(row, "date"),
    hour: string(row, "hour"),
    agent: string(row, "agent"),
    provider: string(row, "provider"),
    model: string(row, "model"),
    requests: integer(row, "requests"),
    inputTokens: integer(row, "inputTokens"),
    outputTokens: integer(row, "outputTokens"),
    reasoningTokens: integer(row, "reasoningTokens"),
    cacheReadTokens: integer(row, "cacheReadTokens"),
    cacheWriteTokens: integer(row, "cacheWriteTokens"),
    estimatedCost: number(row, "estimatedCost"),
    billedCost: number(row, "billedCost"),
    unpricedRequests: integer(row, "unpricedRequests"),
  };
}

function parseQuotaAggregate(row: Record<string, unknown>): LegacyQuotaAggregate {
  return {
    date: string(row, "date"),
    provider: string(row, "provider"),
    takenAt: string(row, "takenAt"),
    percentUsed: nullableNumber(row, "percentUsed"),
    plan: nullableString(row, "plan"),
    resetsAt: nullableString(row, "resetsAt"),
  };
}

function compareUsage(
  machine: LegacyMachine,
  legacyRows: readonly LegacyUsageAggregate[],
  snapshots: readonly DailySnapshot[],
  differences: EquivalenceDifference[],
  classification: EquivalenceDifference["classification"],
): void {
  const sqlite = aggregateUsageByDimension(legacyRows);
  const snapshot = aggregateUsageByDimension(
    snapshots.flatMap((day) => day.usage.map((row) => ({ ...row, date: day.date }))),
  );
  for (const key of new Set([...sqlite.keys(), ...snapshot.keys()])) {
    const sqliteRow = sqlite.get(key);
    const snapshotRow = snapshot.get(key);
    const dimensions = (sqliteRow ?? snapshotRow)!;
    for (const metric of METRICS) {
      const sqliteValue = sqliteRow?.[metric] ?? 0;
      const snapshotValue = snapshotRow?.[metric] ?? 0;
      if (sameMetric(metric, sqliteValue, snapshotValue)) continue;
      differences.push({
        classification,
        scope: "usage",
        machine,
        date: dimensions.date,
        agent: dimensions.agent,
        provider: dimensions.provider,
        model: dimensions.model,
        metric,
        sqlite: sqliteValue,
        snapshot: snapshotValue,
        explanation: explanationFor(classification),
      });
    }
  }
}

function compareQuotas(
  machine: LegacyMachine,
  legacyRows: readonly LegacyQuotaAggregate[],
  snapshots: readonly DailySnapshot[],
  differences: EquivalenceDifference[],
  classification: EquivalenceDifference["classification"],
): void {
  const sqlite = new Map(legacyRows.map((sample) => [quotaKey(sample), sample]));
  const snapshotRows = snapshots.flatMap((day) =>
    day.quotaSamples.map((sample) => ({ ...sample, date: day.date })),
  );
  const snapshot = new Map(snapshotRows.map((sample) => [quotaKey(sample), sample]));
  for (const key of new Set([...sqlite.keys(), ...snapshot.keys()])) {
    const sqliteSample = sqlite.get(key);
    const snapshotSample = snapshot.get(key);
    const sample = (sqliteSample ?? snapshotSample)!;
    for (const metric of ["sample", "percentUsed", "plan", "resetsAt"] as const) {
      const sqliteValue = metric === "sample" ? Number(sqliteSample !== undefined) : sqliteSample?.[metric] ?? null;
      const snapshotValue = metric === "sample" ? Number(snapshotSample !== undefined) : snapshotSample?.[metric] ?? null;
      if (sqliteValue === snapshotValue) continue;
      differences.push({
        classification,
        scope: "quota",
        machine,
        date: sample.date,
        agent: null,
        provider: sample.provider,
        model: null,
        metric,
        sqlite: sqliteValue,
        snapshot: snapshotValue,
        explanation: explanationFor(classification),
      });
    }
  }
}

interface DimensionAggregate extends SnapshotTotals {
  date: string;
  agent: string;
  provider: string;
  model: string;
}

function aggregateUsageByDimension(rows: readonly LegacyUsageAggregate[]): Map<string, DimensionAggregate> {
  const groups = new Map<string, DimensionAggregate>();
  for (const row of rows) {
    const key = JSON.stringify([row.date, row.agent, row.provider, row.model]);
    const current = groups.get(key) ?? {
      date: row.date,
      agent: row.agent,
      provider: row.provider,
      model: row.model,
      ...emptyMetrics(),
    };
    addMetrics(current, row);
    groups.set(key, current);
  }
  return groups;
}

function renderEquivalenceReport(
  generatedAt: string,
  machines: readonly LegacyMachine[],
  coverage: readonly MachineEquivalenceCoverage[],
  differences: readonly EquivalenceDifference[],
  expectedAdditions: readonly EquivalenceDifference[],
): string {
  const lines = [
    "# SQLite Snapshot Equivalence Report",
    "",
    `Generated: ${generatedAt}`,
    `Machines: ${machines.join(", ")}`,
    `Status: ${differences.length === 0 ? "PASS" : "BLOCKED"}`,
    `Unresolved overlap mismatches: ${differences.length}`,
    `Expected additions outside legacy coverage: ${expectedAdditions.length}`,
    "",
    "The report contains aggregate dimensions and sanitized quota values only. Source locations and raw records are intentionally omitted.",
    "",
    "Strict metric comparison is limited to the overlapping SQLite/snapshot coverage. Valid snapshot metrics outside SQLite coverage are recorded as expected additions and do not block the gate.",
    "",
    "## Coverage",
    "",
    "| Machine | SQLite | Snapshots | Strict overlap |",
    "| --- | --- | --- | --- |",
    ...coverage.map((entry) =>
      `| ${entry.machine} | ${formatCoverage(entry.sqlite)} | ${formatCoverage(entry.snapshot)} | ${formatCoverage(entry.overlap)} |`
    ),
    "",
    "## Expected Additions",
    "",
  ];
  if (expectedAdditions.length === 0) {
    lines.push("No snapshot-only additions detected outside legacy coverage.", "");
  } else {
    appendDifferenceTable(lines, expectedAdditions);
  }
  lines.push("## Overlap Mismatches", "");
  if (differences.length === 0) {
    lines.push("No equivalence mismatches detected inside strict overlap.", "");
  } else {
    appendDifferenceTable(lines, differences);
  }
  lines.push("Cutover remains blocked while any overlap mismatch is unresolved or lacks explicit user acceptance.", "");
  return lines.join("\n");
}

function appendDifferenceTable(lines: string[], differences: readonly EquivalenceDifference[]): void {
  lines.push(
    "| Scope | Machine | Date | Agent | Provider | Model | Metric | SQLite | Snapshot | Explanation |",
    "| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | --- |",
  );
  for (const difference of differences) {
    lines.push(
      `| ${difference.scope} | ${difference.machine} | ${difference.date} | ${difference.agent ?? "—"} | ${difference.provider} | ${difference.model ?? "—"} | ${difference.metric} | ${formatValue(difference.sqlite)} | ${formatValue(difference.snapshot)} | ${difference.explanation} |`,
    );
  }
  lines.push("");
}

function formatCoverage(coverage: DateCoverage | null): string {
  return coverage ? `${coverage.firstDate} to ${coverage.lastDate}` : "none";
}

function explanationFor(
  classification: EquivalenceDifference["classification"],
): EquivalenceDifference["explanation"] {
  return classification === "overlap-mismatch"
    ? "Unresolved overlap mismatch; review required."
    : "Expected snapshot-only addition outside legacy coverage.";
}

function coverageForDates(dates: readonly string[]): DateCoverage | null {
  if (dates.length === 0) return null;
  const sorted = [...new Set(dates)].sort(compareStrings);
  return { firstDate: sorted[0]!, lastDate: sorted.at(-1)! };
}

function intersectCoverage(
  left: DateCoverage | null,
  right: DateCoverage | null,
): DateCoverage | null {
  if (!left || !right) return null;
  const firstDate = left.firstDate > right.firstDate ? left.firstDate : right.firstDate;
  const lastDate = left.lastDate < right.lastDate ? left.lastDate : right.lastDate;
  return firstDate <= lastDate ? { firstDate, lastDate } : null;
}

function isWithinCoverage(date: string, coverage: DateCoverage | null): boolean {
  return coverage !== null && date >= coverage.firstDate && date <= coverage.lastDate;
}

function parseLegacyMachine(machineInput: AllowedMachine): LegacyMachine {
  const machine = allowedMachineSchema.parse(machineInput);
  if (machine !== "angel-mac" && machine !== "old-mac") {
    throw new LegacyMigrationError(`${machine} has no legacy SQLite history to import or compare`);
  }
  return machine;
}

function formatValue(value: number | string | null): string {
  if (value === null) return "null";
  return String(value).replaceAll("|", "\\|");
}

function groupByDate<T extends { date: string }>(rows: readonly T[]): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    const values = result.get(row.date) ?? [];
    values.push(row);
    result.set(row.date, values);
  }
  return result;
}

function sumMetrics(rows: readonly HourlyUsageRow[]): SnapshotTotals {
  const totals = emptyMetrics();
  for (const row of rows) addMetrics(totals, row);
  return totals;
}

function emptyMetrics(): SnapshotTotals {
  return {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    estimatedCost: 0,
    billedCost: 0,
    unpricedRequests: 0,
  };
}

function addMetrics(target: SnapshotTotals, source: SnapshotTotals): void {
  for (const metric of METRICS) target[metric] += source[metric];
}

function sameMetric(metric: Metric, left: number, right: number): boolean {
  if (metric !== "estimatedCost" && metric !== "billedCost") return left === right;
  return Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(left), Math.abs(right));
}

function quotaKey(sample: LegacyQuotaAggregate): string {
  return JSON.stringify([sample.date, sample.provider, sample.takenAt]);
}

function queryRows(database: DatabaseSync, sql: string, ...params: SQLInputValue[]): Record<string, unknown>[] {
  return database.prepare(sql).all(...params) as Record<string, unknown>[];
}

function queryOne(database: DatabaseSync, sql: string, ...params: SQLInputValue[]): Record<string, unknown> {
  const row = database.prepare(sql).get(...params) as Record<string, unknown> | undefined;
  if (!row) throw new LegacyMigrationError("Legacy aggregate query returned no result");
  return row;
}

function string(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.length === 0) throw invalidAggregate();
  return value;
}

function nullableString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== "string" || value.length === 0) throw invalidAggregate();
  return value;
}

function number(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw invalidAggregate();
  return value;
}

function integer(row: Record<string, unknown>, key: string): number {
  const value = number(row, key);
  if (!Number.isSafeInteger(value)) throw invalidAggregate();
  return value;
}

function nullableNumber(row: Record<string, unknown>, key: string): number | null {
  if (row[key] === null) return null;
  return number(row, key);
}

function invalidAggregate(): LegacyMigrationError {
  return new LegacyMigrationError("Legacy SQLite produced an invalid aggregate value");
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

async function cli(argv: readonly string[]): Promise<number> {
  const command = argv[0];
  const parsed = parseArgs({
    args: argv.slice(1),
    options: {
      db: { type: "string" },
      repository: { type: "string", default: process.cwd() },
      machine: { type: "string", multiple: command === "equivalence" },
      report: { type: "string" },
    },
    allowPositionals: false,
  });
  const databasePath = required(parsed.values.db, "--db");
  const repositoryRoot = required(parsed.values.repository, "--repository");

  if (command === "import") {
    const rawMachine = parsed.values.machine;
    if (Array.isArray(rawMachine)) throw new LegacyMigrationError("import accepts exactly one --machine");
    const machine = allowedMachineSchema.parse(required(rawMachine, "--machine"));
    const result = await importLegacySnapshots({ databasePath, repositoryRoot, machine });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  if (command === "equivalence") {
    const rawMachines = parsed.values.machine;
    const machines = (Array.isArray(rawMachines) ? rawMachines : rawMachines ? [rawMachines] : undefined)?.map(
      (machine) => allowedMachineSchema.parse(machine),
    );
    const result = await createEquivalenceReport({ databasePath, repositoryRoot, machines });
    const reportPath = required(parsed.values.report, "--report");
    await mkdir(dirname(resolve(reportPath)), { recursive: true });
    await writeFile(resolve(reportPath), result.report, { encoding: "utf8", mode: 0o600 });
    process.stdout.write(`${JSON.stringify({
      machines: result.machines,
      overlapMismatches: result.differences.length,
      expectedAdditions: result.expectedAdditions.length,
    }, null, 2)}\n`);
    return result.differences.length === 0 ? 0 : 2;
  }

  throw new LegacyMigrationError("Expected command: import or equivalence");
}

function required(value: string | undefined, option: string): string {
  if (!value) throw new LegacyMigrationError(`${option} is required`);
  return value;
}

const entryPoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entryPoint) {
  cli(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof LegacyMigrationError ? error.message : "Migration failed"}\n`);
      process.exitCode = 1;
    });
}
