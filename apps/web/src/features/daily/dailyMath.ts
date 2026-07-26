import type { StatsDailyResponse } from "@tokenviewer/core/schemas";
import { totalTokens } from "../../lib/format";

export type DailyMetric = "tokens" | "cost" | "requests";

export function dailyValue(row: StatsDailyResponse["rows"][number], metric: DailyMetric): number {
  if (metric === "cost") return row.estimatedCost;
  if (metric === "requests") return row.requests;
  return totalTokens(row);
}

export function aggregateDailyTotals(
  rows: StatsDailyResponse["rows"],
  metric: DailyMetric,
): Array<{ day: string; value: number }> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.day, (totals.get(row.day) ?? 0) + dailyValue(row, metric));
  }
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([day, value]) => ({ day, value }));
}

export function movingAverage(values: number[], windowSize = 7): number[] {
  return values.map((_, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const window = values.slice(start, index + 1);
    return window.reduce((sum, value) => sum + value, 0) / window.length;
  });
}
