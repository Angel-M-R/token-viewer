import { z } from "zod";

export const SNAPSHOT_SCHEMA_VERSION = 2 as const;
export const SNAPSHOT_MACHINES = ["angel-mac", "old-mac", "mac-m5"] as const;
export const ACTIVE_PUBLISHER_MACHINES = ["angel-mac", "mac-m5"] as const;
export const UNKNOWN_DIMENSION = "unknown" as const;

export const snapshotMachineSchema = z.enum(SNAPSHOT_MACHINES);
export const activePublisherMachineSchema = z.enum(ACTIVE_PUBLISHER_MACHINES);
export const ALLOWED_MACHINES = SNAPSHOT_MACHINES;
export const allowedMachineSchema = snapshotMachineSchema;
export const canonicalUnknownDimensionSchema = z.literal(UNKNOWN_DIMENSION);

const nonNegativeIntegerSchema = z.number().finite().int().nonnegative();
const nonNegativeNumberSchema = z.number().finite().nonnegative();
const utcInstantSchema = z.string().datetime({ offset: false });
const snapshotDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dimensionSchema = z.string().min(1);

const aggregateMetricsShape = {
  requests: nonNegativeIntegerSchema,
  inputTokens: nonNegativeIntegerSchema,
  outputTokens: nonNegativeIntegerSchema,
  reasoningTokens: nonNegativeIntegerSchema,
  cacheReadTokens: nonNegativeIntegerSchema,
  cacheWriteTokens: nonNegativeIntegerSchema,
  estimatedCost: nonNegativeNumberSchema,
  billedCost: nonNegativeNumberSchema,
  unpricedRequests: nonNegativeIntegerSchema,
};

export const snapshotTotalsSchema = z.object(aggregateMetricsShape).strict();

export const dailyUsageRowSchema = z
  .object({
    agent: dimensionSchema,
    provider: dimensionSchema,
    model: dimensionSchema,
    ...aggregateMetricsShape,
  })
  .strict();

export const sanitizedQuotaSampleSchema = z
  .object({
    provider: dimensionSchema,
    takenAt: snapshotDateSchema,
    percentUsed: z.number().finite().min(0).max(100).nullable().optional(),
    plan: z.string().min(1).nullable().optional(),
    resetsAt: utcInstantSchema.nullable().optional(),
  })
  .strict();

export const dailySnapshotSchema = z
  .object({
    schemaVersion: z.literal(SNAPSHOT_SCHEMA_VERSION),
    machine: snapshotMachineSchema,
    date: snapshotDateSchema,
    generatedAt: utcInstantSchema,
    usage: z.array(dailyUsageRowSchema),
    quotaSamples: z.array(sanitizedQuotaSampleSchema),
    totals: snapshotTotalsSchema.optional(),
  })
  .strict();

export type SnapshotMachine = z.infer<typeof snapshotMachineSchema>;
export type ActivePublisherMachine = z.infer<typeof activePublisherMachineSchema>;
export type AllowedMachine = SnapshotMachine;
export type CanonicalUnknownDimension = z.infer<typeof canonicalUnknownDimensionSchema>;
export type SnapshotTotals = z.infer<typeof snapshotTotalsSchema>;
export type DailyUsageRow = z.infer<typeof dailyUsageRowSchema>;
export type SanitizedQuotaSample = z.infer<typeof sanitizedQuotaSampleSchema>;
export type DailySnapshot = z.infer<typeof dailySnapshotSchema>;

export interface SnapshotSourceFile {
  path: string;
  value: unknown;
}

export interface CanonicalSnapshotPath {
  path: string;
  machine: AllowedMachine;
  date: string;
}

export interface ValidatedSnapshotFile extends CanonicalSnapshotPath {
  snapshot: DailySnapshot;
}

export interface SnapshotValidationIssue {
  code: string;
  path: string;
  property?: string;
}

export class SnapshotValidationError extends Error {
  readonly issues: readonly SnapshotValidationIssue[];

  constructor(issues: readonly SnapshotValidationIssue[]) {
    super(issues.map(formatValidationIssue).join("\n"));
    this.name = "SnapshotValidationError";
    this.issues = issues;
  }
}

const CANONICAL_SNAPSHOT_PATH =
  new RegExp(
    `^snapshots/(${SNAPSHOT_MACHINES.join("|")})/(\\d{4})/(\\d{2})/(\\d{4}-\\d{2}-\\d{2})\\.json$`,
  );
const FORBIDDEN_PROPERTY_NAMES = new Set([
  "account",
  "accountid",
  "apikey",
  "authtoken",
  "bearertoken",
  "conversation",
  "conversationid",
  "credential",
  "credentials",
  "email",
  "filepath",
  "hour",
  "hours",
  "login",
  "machinetoken",
  "message",
  "messages",
  "nativeid",
  "originalpayload",
  "password",
  "path",
  "payload",
  "project",
  "projectid",
  "prompt",
  "raw",
  "recordhash",
  "refreshtoken",
  "requestid",
  "secret",
  "session",
  "sessionid",
  "sourcefile",
  "token",
  "userid",
]);
const METRIC_NAMES = [
  "requests",
  "inputTokens",
  "outputTokens",
  "reasoningTokens",
  "cacheReadTokens",
  "cacheWriteTokens",
  "estimatedCost",
  "billedCost",
  "unpricedRequests",
] as const satisfies readonly (keyof SnapshotTotals)[];

export function parseCanonicalSnapshotPath(path: string): CanonicalSnapshotPath {
  const match = CANONICAL_SNAPSHOT_PATH.exec(path);
  if (!match) {
    throw new SnapshotValidationError([{ code: "non_canonical_path", path }]);
  }

  const [, machine, year, month, date] = match;
  if (!machine || !year || !month || !date || !isCalendarDate(date)) {
    throw new SnapshotValidationError([{ code: "non_canonical_path", path }]);
  }
  if (!date.startsWith(`${year}-${month}-`)) {
    throw new SnapshotValidationError([{ code: "path_date_disagreement", path }]);
  }

  return {
    path,
    machine: snapshotMachineSchema.parse(machine),
    date,
  };
}

export function validateSnapshotSet(
  files: readonly SnapshotSourceFile[],
): readonly ValidatedSnapshotFile[] {
  const issues: SnapshotValidationIssue[] = [];
  const validated: ValidatedSnapshotFile[] = [];
  const seenPaths = new Set<string>();
  const seenMachineDates = new Set<string>();

  for (const file of files) {
    if (seenPaths.has(file.path)) {
      issues.push({ code: "duplicate_path", path: file.path });
      continue;
    }
    seenPaths.add(file.path);

    let parsedPath: CanonicalSnapshotPath;
    try {
      parsedPath = parseCanonicalSnapshotPath(file.path);
    } catch (error) {
      collectValidationIssues(error, issues, file.path);
      continue;
    }

    const machineDateKey = `${parsedPath.machine}/${parsedPath.date}`;
    if (seenMachineDates.has(machineDateKey)) {
      issues.push({ code: "duplicate_machine_date", path: file.path });
      continue;
    }
    seenMachineDates.add(machineDateKey);

    try {
      validateSnapshotPrivacy(file.value, file.path);
    } catch (error) {
      collectValidationIssues(error, issues, file.path);
      continue;
    }

    const parsedSnapshot = dailySnapshotSchema.safeParse(file.value);
    if (!parsedSnapshot.success) {
      for (const issue of parsedSnapshot.error.issues) {
        issues.push({
          code: `schema_${issue.code}`,
          path: file.path,
          property: issue.path.map(String).join("."),
        });
      }
      continue;
    }

    const snapshot = parsedSnapshot.data;
    validateSnapshotInvariants(parsedPath, snapshot, issues);
    validated.push({ ...parsedPath, snapshot });
  }

  if (issues.length > 0) {
    throw new SnapshotValidationError(issues);
  }

  return validated;
}

export function validateSnapshotPrivacy(value: unknown, path: string): void {
  const issues: SnapshotValidationIssue[] = [];
  collectForbiddenProperties(value, path, "", issues, new WeakSet<object>());

  const parsed = dailySnapshotSchema.safeParse(value);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      if (issue.code !== "unrecognized_keys") continue;
      const parent = issue.path.map(String).join(".");
      for (const key of issue.keys) {
        issues.push({
          code: "privacy_unknown_property",
          path,
          property: parent ? `${parent}.${key}` : key,
        });
      }
    }
  }

  if (issues.length > 0) {
    throw new SnapshotValidationError(issues);
  }
}

export function serializeDailySnapshot(snapshot: DailySnapshot): string {
  const parsed = dailySnapshotSchema.parse(snapshot);
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

function validateSnapshotInvariants(
  parsedPath: CanonicalSnapshotPath,
  snapshot: DailySnapshot,
  issues: SnapshotValidationIssue[],
): void {
  if (snapshot.machine !== parsedPath.machine) {
    issues.push({ code: "machine_path_disagreement", path: parsedPath.path, property: "machine" });
  }
  if (snapshot.date !== parsedPath.date) {
    issues.push({ code: "date_path_disagreement", path: parsedPath.path, property: "date" });
  }
  if (!isCalendarDate(snapshot.date)) {
    issues.push({ code: "invalid_calendar_date", path: parsedPath.path, property: "date" });
  }

  const aggregateKeys = new Set<string>();
  let previousUsageKey: readonly string[] | undefined;
  for (const [index, row] of snapshot.usage.entries()) {
    const keyParts = [row.agent, row.provider, row.model] as const;
    const key = JSON.stringify(keyParts);
    if (aggregateKeys.has(key)) {
      issues.push({ code: "duplicate_aggregate_key", path: parsedPath.path, property: `usage.${index}` });
    }
    aggregateKeys.add(key);

    if (previousUsageKey && compareTuples(previousUsageKey, keyParts) >= 0) {
      issues.push({ code: "non_canonical_usage_order", path: parsedPath.path, property: `usage.${index}` });
    }
    previousUsageKey = keyParts;
  }

  let previousQuotaKey: readonly string[] | undefined;
  for (const [index, sample] of snapshot.quotaSamples.entries()) {
    if (sample.takenAt !== snapshot.date) {
      issues.push({
        code: "quota_outside_snapshot_date",
        path: parsedPath.path,
        property: `quotaSamples.${index}.takenAt`,
      });
    }

    const keyParts = [sample.takenAt, sample.provider] as const;
    if (previousQuotaKey && compareTuples(previousQuotaKey, keyParts) >= 0) {
      issues.push({
        code: "non_canonical_quota_order",
        path: parsedPath.path,
        property: `quotaSamples.${index}`,
      });
    }
    previousQuotaKey = keyParts;
  }

  if (snapshot.totals) {
    for (const metric of METRIC_NAMES) {
      const derived = snapshot.usage.reduce((sum, row) => sum + row[metric], 0);
      if (snapshot.totals[metric] !== derived) {
        issues.push({ code: "derived_total_mismatch", path: parsedPath.path, property: `totals.${metric}` });
      }
    }
  }
}

function compareTuples(left: readonly string[], right: readonly string[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftPart = left[index] ?? "";
    const rightPart = right[index] ?? "";
    if (leftPart < rightPart) return -1;
    if (leftPart > rightPart) return 1;
  }
  return 0;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(instant.getTime()) && instant.toISOString().slice(0, 10) === value;
}

function collectForbiddenProperties(
  value: unknown,
  path: string,
  propertyPath: string,
  issues: SnapshotValidationIssue[],
  seen: WeakSet<object>,
): void {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      collectForbiddenProperties(
        item,
        path,
        propertyPath ? `${propertyPath}.${index}` : String(index),
        issues,
        seen,
      );
    }
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const nestedPath = propertyPath ? `${propertyPath}.${key}` : key;
    if (isForbiddenPropertyName(key)) {
      issues.push({ code: "privacy_forbidden_property", path, property: nestedPath });
      continue;
    }
    collectForbiddenProperties(nestedValue, path, nestedPath, issues, seen);
  }
}

function isForbiddenPropertyName(name: string): boolean {
  const canonical = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (FORBIDDEN_PROPERTY_NAMES.has(canonical)) return true;
  if (
    [
      "prompt",
      "conversation",
      "message",
      "session",
      "project",
      "path",
      "credential",
      "password",
      "secret",
      "login",
      "payload",
      "sourcefile",
      "recordhash",
    ].some((part) => canonical.includes(part))
  ) {
    return true;
  }
  if (canonical.startsWith("raw") || canonical.endsWith("raw")) return true;
  return canonical.includes("token") && !canonical.endsWith("tokens");
}

function collectValidationIssues(
  error: unknown,
  issues: SnapshotValidationIssue[],
  fallbackPath: string,
): void {
  if (error instanceof SnapshotValidationError) {
    issues.push(...error.issues);
    return;
  }
  issues.push({ code: "validation_failure", path: fallbackPath });
}

function formatValidationIssue(issue: SnapshotValidationIssue): string {
  const location = issue.property ? `${issue.path}:${issue.property}` : issue.path;
  return `${location}: ${issue.code}`;
}
