import type { DailySnapshot, SnapshotTotals } from "@tokenviewer/core";

export interface DayPreview extends SnapshotTotals {
  date: string;
  rows: number;
  quotaSamples: number;
}

export interface AggregatePreview {
  days: DayPreview[];
  totals: SnapshotTotals;
}

export function summarizeSnapshots(snapshots: readonly DailySnapshot[]): AggregatePreview {
  const totals = emptyTotals();
  const days = snapshots.map((snapshot) => {
    const metrics = snapshot.totals ?? sumRows(snapshot);
    addTotals(totals, metrics);
    return {
      date: snapshot.date,
      rows: snapshot.usage.length,
      quotaSamples: snapshot.quotaSamples.length,
      ...metrics,
    };
  });
  return { days, totals };
}

function sumRows(snapshot: DailySnapshot): SnapshotTotals {
  const totals = emptyTotals();
  for (const row of snapshot.usage) addTotals(totals, row);
  return totals;
}

function addTotals(target: SnapshotTotals, value: SnapshotTotals): void {
  target.requests += value.requests;
  target.inputTokens += value.inputTokens;
  target.outputTokens += value.outputTokens;
  target.reasoningTokens += value.reasoningTokens;
  target.cacheReadTokens += value.cacheReadTokens;
  target.cacheWriteTokens += value.cacheWriteTokens;
  target.estimatedCost += value.estimatedCost;
  target.billedCost += value.billedCost;
  target.unpricedRequests += value.unpricedRequests;
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
