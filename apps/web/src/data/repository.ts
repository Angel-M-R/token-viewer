import type {
  MachineListItem,
  StatsDailyResponse,
  StatsHeatmapResponse,
  StatsModelsResponse,
  StatsSummaryResponse,
} from "@tokenviewer/core/schemas";
import {
  ALLOWED_MACHINES,
  type AllowedMachine,
  type HourlyUsageRow,
  type SanitizedQuotaSample,
  type SnapshotTotals,
  type ValidatedSnapshotFile,
} from "@tokenviewer/core/snapshots";
import type { LocalQuotaSnapshotsResponse } from "./contracts";
import { loadDiscoveredSnapshots } from "./snapshotLoader";

export interface LocalFilters {
  from?: string;
  to?: string;
  machine?: string[];
  agent?: string[];
  provider?: string[];
  model?: string[];
}

export interface AvailableFilters {
  machines: AllowedMachine[];
  agents: string[];
  providers: string[];
  models: string[];
}

export type DailyGroupBy = "none" | "agent" | "model" | "machine";
export type HeatmapMetric = "tokens" | "cost" | "requests";

interface LocalUsageRow extends HourlyUsageRow {
  date: string;
  machine: AllowedMachine;
}

interface LocalQuotaSample extends SanitizedQuotaSample {
  date: string;
  machine: AllowedMachine;
}

const METRIC_KEYS = [
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

export class InvalidLocalQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidLocalQueryError";
  }
}

export class InvalidTimeZoneError extends InvalidLocalQueryError {
  readonly timeZone: string;

  constructor(timeZone: string) {
    super(`Invalid IANA timezone: ${timeZone}`);
    this.name = "InvalidTimeZoneError";
    this.timeZone = timeZone;
  }
}

export class LocalSnapshotRepository {
  readonly #files: readonly ValidatedSnapshotFile[];
  readonly #usage: readonly LocalUsageRow[];
  readonly #quota: readonly LocalQuotaSample[];

  constructor(files: readonly ValidatedSnapshotFile[]) {
    this.#files = files;
    this.#usage = files.flatMap(({ snapshot }) =>
      snapshot.usage.map((row) => ({ ...row, date: snapshot.date, machine: snapshot.machine })),
    );
    this.#quota = files.flatMap(({ snapshot }) =>
      snapshot.quotaSamples.map((sample) => ({
        ...sample,
        date: snapshot.date,
        machine: snapshot.machine,
      })),
    );
  }

  queryAvailableFilters(filters: LocalFilters = {}): AvailableFilters {
    const rows = this.#filteredUsage(filters);
    return {
      machines: unique(rows.map((row) => row.machine)),
      agents: unique(rows.map((row) => row.agent)),
      providers: unique([
        ...rows.map((row) => row.provider),
        ...this.#filteredQuota(filters).map((sample) => sample.provider),
      ]),
      models: unique(rows.map((row) => row.model)),
    };
  }

  querySummary(filters: LocalFilters = {}): StatsSummaryResponse {
    const rows = this.#filteredUsage(filters);
    return {
      ...sumMetrics(rows),
      modelCount: new Set(rows.map((row) => row.model)).size,
    };
  }

  queryDaily(filters: LocalFilters = {}, groupBy: DailyGroupBy = "none"): StatsDailyResponse {
    const groups = new Map<string, StatsDailyResponse["rows"][number]>();
    for (const row of this.#filteredUsage(filters)) {
      const group = groupValue(row, groupBy);
      const key = JSON.stringify([row.date, group]);
      const current = groups.get(key) ?? emptyDailyRow(row.date, group);
      addDailyMetrics(current, row);
      groups.set(key, current);
    }
    return {
      groupBy,
      rows: [...groups.values()].sort((left, right) =>
        compareStrings(JSON.stringify([left.day, left.group]), JSON.stringify([right.day, right.group])),
      ),
    };
  }

  queryCalendarHeatmap(filters: LocalFilters = {}): StatsDailyResponse {
    return this.queryDaily(filters, "none");
  }

  queryModels(filters: LocalFilters = {}): StatsModelsResponse {
    const groups = new Map<string, StatsModelsResponse["rows"][number]>();
    for (const row of this.#filteredUsage(filters)) {
      const key = JSON.stringify([row.provider, row.model]);
      const current = groups.get(key) ?? {
        provider: row.provider,
        model: row.model,
        ...emptyMetrics(),
      };
      addMetrics(current, row);
      groups.set(key, current);
    }
    return {
      rows: [...groups.values()].sort((left, right) =>
        compareStrings(
          JSON.stringify([left.provider, left.model]),
          JSON.stringify([right.provider, right.model]),
        ),
      ),
    };
  }

  queryHourlyHeatmap(
    filters: LocalFilters = {},
    metric: HeatmapMetric = "tokens",
    timeZone = "UTC",
  ): StatsHeatmapResponse {
    const formatter = timeZoneFormatter(timeZone);
    const matrix = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
    for (const row of this.#filteredUsage(filters)) {
      const parts = Object.fromEntries(
        formatter.formatToParts(new Date(row.hour)).map((part) => [part.type, part.value]),
      );
      const weekday = WEEKDAY_INDEX[parts.weekday ?? ""];
      const hour = Number(parts.hour);
      if (weekday === undefined || !Number.isInteger(hour) || hour < 0 || hour > 23) {
        throw new InvalidTimeZoneError(timeZone);
      }
      const day = matrix[weekday];
      if (day) day[hour] = (day[hour] ?? 0) + heatmapValue(row, metric);
    }
    return { metric, tz: timeZone, matrix };
  }

  queryQuotas(filters: LocalFilters = {}, provider = "copilot"): LocalQuotaSnapshotsResponse {
    const groupedSamples = new Map<string, Map<string, LocalQuotaSample>>();
    for (const sample of this.#filteredQuota(filters).filter((item) => item.provider === provider)) {
      const key = JSON.stringify([sample.machine, sample.provider]);
      const samplesByInstant = groupedSamples.get(key) ?? new Map<string, LocalQuotaSample>();
      samplesByInstant.set(sample.takenAt, sample);
      groupedSamples.set(key, samplesByInstant);
    }

    const groups: LocalQuotaSnapshotsResponse["groups"] = [];
    for (const samplesByInstant of groupedSamples.values()) {
      const samples = [...samplesByInstant.values()].sort((left, right) =>
        compareStrings(left.takenAt, right.takenAt),
      );
      const latest = samples.at(-1);
      if (!latest) continue;
      groups.push({
        machine: latest.machine,
        provider: latest.provider,
        latest: {
          takenAt: latest.takenAt,
          percentUsed: latest.percentUsed ?? undefined,
          plan: latest.plan ?? null,
          resetsAt: latest.resetsAt ?? null,
        },
        series: samples.map((sample) => ({
          takenAt: sample.takenAt,
          percentUsed: sample.percentUsed ?? undefined,
        })),
      });
    }
    groups.sort((left, right) =>
      compareStrings(
        JSON.stringify([left.machine, left.provider]),
        JSON.stringify([right.machine, right.provider]),
      ),
    );
    return { provider, groups };
  }

  queryMachines(): MachineListItem[] {
    return ALLOWED_MACHINES.flatMap((machine, index) => {
      const files = this.#files.filter((file) => file.machine === machine);
      if (files.length === 0) return [];
      const usage = this.#usage.filter((row) => row.machine === machine);
      const totals = sumMetrics(usage);
      const generated = files.map((file) => file.snapshot.generatedAt).sort(compareStrings);
      const lastSeen = usage.map((row) => row.hour).sort(compareStrings).at(-1) ?? generated.at(-1) ?? null;
      return [{
        id: index + 1,
        name: machine,
        os: null,
        createdAt: generated[0] ?? `${files[0]?.date}T00:00:00.000Z`,
        lastSeenAt: lastSeen,
        requests: totals.requests,
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        reasoningTokens: totals.reasoningTokens,
        cacheReadTokens: totals.cacheReadTokens,
        cacheWriteTokens: totals.cacheWriteTokens,
      }];
    });
  }

  #filteredUsage(filters: LocalFilters): LocalUsageRow[] {
    validateFilters(filters);
    return this.#usage.filter((row) => matchesUsage(row, filters));
  }

  #filteredQuota(filters: LocalFilters): LocalQuotaSample[] {
    validateFilters(filters);
    return this.#quota.filter((sample) =>
      inDateRange(sample.date, filters) &&
      includesFilter(filters.machine, sample.machine) &&
      includesFilter(filters.provider, sample.provider),
    );
  }
}

let defaultRepository: LocalSnapshotRepository | undefined;

export function getLocalSnapshotRepository(): LocalSnapshotRepository {
  defaultRepository ??= new LocalSnapshotRepository(loadDiscoveredSnapshots());
  return defaultRepository;
}

function matchesUsage(row: LocalUsageRow, filters: LocalFilters): boolean {
  return inDateRange(row.date, filters) &&
    includesFilter(filters.machine, row.machine) &&
    includesFilter(filters.agent, row.agent) &&
    includesFilter(filters.provider, row.provider) &&
    includesFilter(filters.model, row.model);
}

function inDateRange(date: string, filters: LocalFilters): boolean {
  return (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to);
}

function includesFilter(values: readonly string[] | undefined, value: string): boolean {
  return !values || values.length === 0 || values.includes(value);
}

function validateFilters(filters: LocalFilters): void {
  for (const [name, value] of [["from", filters.from], ["to", filters.to]] as const) {
    if (value && !isDateOnly(value)) throw new InvalidLocalQueryError(`${name} must be YYYY-MM-DD`);
  }
  if (filters.from && filters.to && filters.from > filters.to) {
    throw new InvalidLocalQueryError("from must be on or before to");
  }
  for (const [name, values] of Object.entries(filters)) {
    if (Array.isArray(values) && values.some((value) => typeof value !== "string" || value.length === 0)) {
      throw new InvalidLocalQueryError(`${name} filters must be non-empty strings`);
    }
  }
  if (filters.machine?.some((machine) => !ALLOWED_MACHINES.includes(machine as AllowedMachine))) {
    throw new InvalidLocalQueryError(`machine must be one of: ${ALLOWED_MACHINES.join(", ")}`);
  }
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function groupValue(row: LocalUsageRow, groupBy: DailyGroupBy): string | null {
  if (groupBy === "agent") return row.agent;
  if (groupBy === "model") return row.model;
  if (groupBy === "machine") return row.machine;
  return null;
}

function emptyDailyRow(day: string, group: string | null): StatsDailyResponse["rows"][number] {
  return {
    day,
    group,
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    estimatedCost: 0,
    billedCost: 0,
  };
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

function sumMetrics(rows: readonly SnapshotTotals[]): SnapshotTotals {
  const totals = emptyMetrics();
  for (const row of rows) addMetrics(totals, row);
  return totals;
}

function addMetrics(target: SnapshotTotals, source: SnapshotTotals): void {
  for (const key of METRIC_KEYS) target[key] += source[key];
}

function addDailyMetrics(
  target: StatsDailyResponse["rows"][number],
  source: SnapshotTotals,
): void {
  target.requests += source.requests;
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.reasoningTokens += source.reasoningTokens;
  target.cacheReadTokens += source.cacheReadTokens;
  target.cacheWriteTokens += source.cacheWriteTokens;
  target.estimatedCost += source.estimatedCost;
  target.billedCost += source.billedCost;
}

function heatmapValue(row: HourlyUsageRow, metric: HeatmapMetric): number {
  if (metric === "cost") return row.estimatedCost;
  if (metric === "requests") return row.requests;
  return row.inputTokens + row.outputTokens + row.reasoningTokens + row.cacheReadTokens + row.cacheWriteTokens;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function timeZoneFormatter(timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    throw new InvalidTimeZoneError(timeZone);
  }
}

function unique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort(compareStrings);
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
