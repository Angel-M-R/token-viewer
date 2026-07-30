import { localSnapshotDate } from "./local-day.js";
import { priceUsageRecord, type PricingCatalog } from "./pricing.js";
import {
  UNKNOWN_DIMENSION,
  allowedMachineSchema,
  type AllowedMachine,
  type DailyUsageRow,
  type SnapshotTotals,
} from "./snapshots.js";
import type { UsageRecord } from "./types.js";

export interface DailyUsageAggregate {
  date: string;
  usage: readonly DailyUsageRow[];
  totals: SnapshotTotals;
}

export interface UsageAggregationResult {
  machine: AllowedMachine;
  days: readonly DailyUsageAggregate[];
  duplicateRecords: number;
  skippedRecords: number;
}

type MutableMetrics = SnapshotTotals;

interface MutableRow extends MutableMetrics {
  date: string;
  agent: string;
  provider: string;
  model: string;
}

export function aggregateUsageRecords(
  records: Iterable<UsageRecord>,
  machine: AllowedMachine,
  pricing: PricingCatalog,
): UsageAggregationResult {
  const parsedMachine = allowedMachineSchema.parse(machine);
  const seenHashes = new Set<string>();
  const rows = new Map<string, MutableRow>();
  let duplicateRecords = 0;
  let skippedRecords = 0;

  for (const record of records) {
    if (seenHashes.has(record.recordHash)) {
      duplicateRecords += 1;
      continue;
    }
    seenHashes.add(record.recordHash);

    const date = localSnapshotDate(record.timestamp);
    if (!date) {
      skippedRecords += 1;
      continue;
    }

    const agent = normalizeDimension(record.agent);
    const provider = normalizeDimension(record.provider);
    const model = normalizeDimension(record.model);
    const key = JSON.stringify([date, agent, provider, model]);
    let row = rows.get(key);
    if (!row) {
      row = {
        date,
        agent,
        provider,
        model,
        ...emptyMetrics(),
      };
      rows.set(key, row);
    }

    const priced = priceUsageRecord(record, pricing);
    row.requests += 1;
    row.inputTokens += record.inputTokens;
    row.outputTokens += record.outputTokens;
    row.reasoningTokens += record.reasoningTokens;
    row.cacheReadTokens += record.cacheReadTokens;
    row.cacheWriteTokens += record.cacheWriteTokens;
    row.estimatedCost += priced.costUsd ?? 0;
    row.billedCost += validCost(record.billedCost);
    row.unpricedRequests += priced.costUsd === null ? 1 : 0;
  }

  const rowsByDate = new Map<string, DailyUsageRow[]>();
  for (const { date, ...row } of [...rows.values()].sort(compareRows)) {
    const dailyRows = rowsByDate.get(date) ?? [];
    dailyRows.push(row);
    rowsByDate.set(date, dailyRows);
  }

  return {
    machine: parsedMachine,
    days: [...rowsByDate.entries()].map(([date, usage]) => ({
      date,
      usage,
      totals: sumMetrics(usage),
    })),
    duplicateRecords,
    skippedRecords,
  };
}

export function discoverAvailableSourceDates(records: Iterable<UsageRecord>): readonly string[] {
  const dates = new Set<string>();
  for (const record of records) {
    const date = localSnapshotDate(record.timestamp);
    if (date) dates.add(date);
  }
  return [...dates].sort(compareStrings);
}

function normalizeDimension(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized || UNKNOWN_DIMENSION;
}

function validCost(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function emptyMetrics(): MutableMetrics {
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

function sumMetrics(rows: readonly DailyUsageRow[]): SnapshotTotals {
  const totals = emptyMetrics();
  for (const row of rows) {
    totals.requests += row.requests;
    totals.inputTokens += row.inputTokens;
    totals.outputTokens += row.outputTokens;
    totals.reasoningTokens += row.reasoningTokens;
    totals.cacheReadTokens += row.cacheReadTokens;
    totals.cacheWriteTokens += row.cacheWriteTokens;
    totals.estimatedCost += row.estimatedCost;
    totals.billedCost += row.billedCost;
    totals.unpricedRequests += row.unpricedRequests;
  }
  return totals;
}

function compareRows(left: MutableRow, right: MutableRow): number {
  return compareStrings(
    JSON.stringify([left.date, left.agent, left.provider, left.model]),
    JSON.stringify([right.date, right.agent, right.provider, right.model]),
  );
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
