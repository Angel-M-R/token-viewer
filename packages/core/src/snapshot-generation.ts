import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { localSnapshotDate } from "./local-day.js";
import type { PricingCatalog } from "./pricing.js";
import {
  SNAPSHOT_SCHEMA_VERSION,
  parseCanonicalSnapshotPath,
  serializeDailySnapshot,
  validateSnapshotSet,
  type AllowedMachine,
  type DailySnapshot,
  type SanitizedQuotaSample,
  type SnapshotTotals,
} from "./snapshots.js";
import type { UsageRecord } from "./types.js";
import {
  aggregateUsageRecords,
  discoverAvailableSourceDates,
  type DailyUsageAggregate,
} from "./usage-aggregation.js";

export interface AtomicSnapshotWriteResult {
  path: string;
  changed: boolean;
}

export interface GenerateDailySnapshotsOptions {
  repositoryRoot: string;
  machine: AllowedMachine;
  records: Iterable<UsageRecord>;
  pricing: PricingCatalog;
  now?: Date;
  repairClosedDates?: readonly string[];
  quotaSamples?: readonly SanitizedQuotaSample[];
}

export interface DailySnapshotGenerationResult {
  availableSourceDates: readonly string[];
  writtenDates: readonly string[];
  unchangedDates: readonly string[];
  protectedClosedDates: readonly string[];
  duplicateRecords: number;
  skippedRecords: number;
  snapshots: readonly DailySnapshot[];
}

export interface DailySnapshotGenerationPlan extends DailySnapshotGenerationResult {
  changedDates: readonly string[];
}

export function canonicalDailySnapshotPath(machine: AllowedMachine, date: string): string {
  const relativePath = `snapshots/${machine}/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}.json`;
  return parseCanonicalSnapshotPath(relativePath).path;
}

export async function writeDailySnapshotAtomic(
  repositoryRoot: string,
  snapshot: DailySnapshot,
): Promise<AtomicSnapshotWriteResult> {
  const relativePath = canonicalDailySnapshotPath(snapshot.machine, snapshot.date);
  validateSnapshotSet([{ path: relativePath, value: snapshot }]);
  const serialized = serializeDailySnapshot(snapshot);
  const targetPath = join(repositoryRoot, ...relativePath.split("/"));
  const previous = await readFile(targetPath, "utf8").catch((error: unknown) => {
    if (isMissingPathError(error)) return null;
    throw error;
  });
  if (previous === serialized) return { path: relativePath, changed: false };

  await mkdir(dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(serialized, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, targetPath);
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
  return { path: relativePath, changed: true };
}

export async function generateDailySnapshots(
  options: GenerateDailySnapshotsOptions,
): Promise<DailySnapshotGenerationResult> {
  const plan = await planDailySnapshots(options);
  const writtenDates: string[] = [];
  const unchangedDates: string[] = [];

  for (const snapshot of plan.snapshots) {
    const write = await writeDailySnapshotAtomic(options.repositoryRoot, snapshot);
    (write.changed ? writtenDates : unchangedDates).push(snapshot.date);
  }

  return {
    availableSourceDates: plan.availableSourceDates,
    writtenDates,
    unchangedDates,
    protectedClosedDates: plan.protectedClosedDates,
    duplicateRecords: plan.duplicateRecords,
    skippedRecords: plan.skippedRecords,
    snapshots: plan.snapshots,
  };
}

export async function planDailySnapshots(
  options: GenerateDailySnapshotsOptions,
): Promise<DailySnapshotGenerationPlan> {
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new TypeError("now must be a valid date");
  const records = [...options.records];
  const availableSourceDates = discoverAvailableSourceDates(records);
  const aggregation = aggregateUsageRecords(records, options.machine, options.pricing);
  const aggregates = new Map(aggregation.days.map((day) => [day.date, day]));
  const openDate = localSnapshotDate(now);
  if (!openDate) throw new TypeError("now must be a valid date");
  const repairDates = new Set(options.repairClosedDates ?? []);
  const dates = new Set(availableSourceDates);
  const quotaSamples = [...(options.quotaSamples ?? [])];

  for (const sample of quotaSamples) dates.add(sample.takenAt);

  if (await snapshotExists(options.repositoryRoot, options.machine, openDate)) dates.add(openDate);
  for (const date of repairDates) {
    canonicalDailySnapshotPath(options.machine, date);
    if (await snapshotExists(options.repositoryRoot, options.machine, date)) dates.add(date);
  }

  const changedDates: string[] = [];
  const unchangedDates: string[] = [];
  const protectedClosedDates: string[] = [];
  const snapshots: DailySnapshot[] = [];

  for (const date of [...dates].sort(compareStrings)) {
    const existing = await readDailySnapshot(options.repositoryRoot, options.machine, date);
    const isClosed = date < openDate;
    if (existing && isClosed && !repairDates.has(date)) {
      protectedClosedDates.push(date);
      continue;
    }

    const aggregate = aggregates.get(date) ?? emptyDailyAggregate(date);
    const baseSnapshot: DailySnapshot = {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      machine: options.machine,
      date,
      generatedAt: existing?.generatedAt ?? now.toISOString(),
      usage: [...aggregate.usage],
      quotaSamples: mergeQuotaSamples(
        existing?.quotaSamples ?? [],
        quotaSamples.filter((sample) => sample.takenAt === date),
      ),
      totals: aggregate.totals,
    };
    const snapshot =
      existing && sameGeneratedContent(existing, baseSnapshot)
        ? baseSnapshot
        : { ...baseSnapshot, generatedAt: now.toISOString() };
    snapshots.push(snapshot);
    (existing && sameGeneratedContent(existing, snapshot) ? unchangedDates : changedDates).push(date);
  }

  validateSnapshotSet(
    snapshots.map((snapshot) => ({
      path: canonicalDailySnapshotPath(snapshot.machine, snapshot.date),
      value: snapshot,
    })),
  );

  return {
    availableSourceDates,
    writtenDates: changedDates,
    unchangedDates,
    protectedClosedDates,
    duplicateRecords: aggregation.duplicateRecords,
    skippedRecords: aggregation.skippedRecords,
    snapshots,
    changedDates,
  };
}

async function readDailySnapshot(
  repositoryRoot: string,
  machine: AllowedMachine,
  date: string,
): Promise<DailySnapshot | null> {
  const relativePath = canonicalDailySnapshotPath(machine, date);
  const targetPath = join(repositoryRoot, ...relativePath.split("/"));
  let source: string;
  try {
    source = await readFile(targetPath, "utf8");
  } catch (error) {
    if (isMissingPathError(error)) return null;
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch {
    value = null;
  }
  return validateSnapshotSet([{ path: relativePath, value }])[0]?.snapshot ?? null;
}

async function snapshotExists(
  repositoryRoot: string,
  machine: AllowedMachine,
  date: string,
): Promise<boolean> {
  const relativePath = canonicalDailySnapshotPath(machine, date);
  return Boolean(
    await stat(join(repositoryRoot, ...relativePath.split("/"))).catch((error: unknown) => {
      if (isMissingPathError(error)) return null;
      throw error;
    }),
  );
}

function emptyDailyAggregate(date: string): DailyUsageAggregate {
  return { date, usage: [], totals: emptyTotals() };
}

function emptyTotals(): SnapshotTotals {
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

function sameGeneratedContent(left: DailySnapshot, right: DailySnapshot): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.machine === right.machine &&
    left.date === right.date &&
    JSON.stringify(left.usage) === JSON.stringify(right.usage) &&
    JSON.stringify(left.quotaSamples) === JSON.stringify(right.quotaSamples) &&
    JSON.stringify(left.totals) === JSON.stringify(right.totals)
  );
}

function mergeQuotaSamples(
  existing: readonly SanitizedQuotaSample[],
  incoming: readonly SanitizedQuotaSample[],
): SanitizedQuotaSample[] {
  const samples = new Map<string, SanitizedQuotaSample>();
  for (const sample of [...existing, ...incoming]) {
    samples.set(JSON.stringify([sample.takenAt, sample.provider]), sample);
  }
  return [...samples.values()].sort((left, right) =>
    compareStrings(
      JSON.stringify([left.takenAt, left.provider]),
      JSON.stringify([right.takenAt, right.provider]),
    ),
  );
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
