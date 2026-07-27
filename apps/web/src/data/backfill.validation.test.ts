import { describe, expect, it } from "vitest";
import type { SnapshotTotals } from "@tokenviewer/core/snapshots";
import { loadSnapshotModules, type SnapshotModuleMap } from "./snapshotLoader";
import { LocalSnapshotRepository, type LocalFilters } from "./repository";
import { representativeSnapshotModules } from "./testFixtures";

const completeBackfillModules = import.meta.glob("../../../../snapshots/**/*.json", {
  eager: true,
  import: "default",
}) as SnapshotModuleMap;

const representativeM5Modules = Object.fromEntries(
  Object.entries(representativeSnapshotModules).filter(([path]) => path.includes("/mac-m5/")),
) as SnapshotModuleMap;

describe("complete historical backfill dashboard validation", () => {
  it("reconciles every view and each global filter against the validated aggregate set", () => {
    const files = loadSnapshotModules({ ...completeBackfillModules, ...representativeM5Modules });
    const repository = new LocalSnapshotRepository(files);
    const rows = files.flatMap((file) =>
      file.snapshot.usage.map((row) => ({ ...row, date: file.date, machine: file.machine })),
    );

    expect(files).toHaveLength(311);
    expect(new Set(files.map((file) => file.machine))).toEqual(
      new Set(["angel-mac", "old-mac", "mac-m5"]),
    );

    const summary = repository.querySummary();
    const expected = sumRows(rows);
    expectSummary(summary, expected);
    expect(repository.queryMachines().map((machine) => machine.name)).toEqual([
      "angel-mac",
      "old-mac",
      "mac-m5",
    ]);

    for (const groupBy of ["none", "agent", "model", "machine"] as const) {
      expect(sum(repository.queryDaily({}, groupBy).rows.map((row) => row.requests))).toBe(summary.requests);
    }
    expect(sum(repository.queryCalendarHeatmap().rows.map((row) => row.requests))).toBe(summary.requests);
    expect(sum(repository.queryModels().rows.map((row) => row.requests))).toBe(summary.requests);
    expect(sumMatrix(repository.queryHourlyHeatmap({}, "requests", "UTC").matrix)).toBe(summary.requests);
    expect(sumMatrix(repository.queryHourlyHeatmap({}, "tokens", "Europe/Madrid").matrix)).toBe(
      totalTokens(expected),
    );
    expect(sumMatrix(repository.queryHourlyHeatmap({}, "cost", "UTC").matrix)).toBeCloseTo(
      expected.estimatedCost,
      10,
    );
    const quotaGroups = repository.queryQuotas({}, "copilot").groups;
    expect(quotaGroups).toHaveLength(1);
    expect(quotaGroups[0]).toMatchObject({ machine: "mac-m5", provider: "copilot" });
    expect(JSON.stringify(quotaGroups)).not.toMatch(/login|account|raw/i);

    const available = repository.queryAvailableFilters();
    for (const [filter, values] of [
      ["machine", available.machines],
      ["agent", available.agents],
      ["provider", available.providers],
      ["model", available.models],
    ] as const) {
      for (const value of values) {
        const filters = { [filter]: [value] } as LocalFilters;
        expectSummary(repository.querySummary(filters), sumRows(filteredRows(rows, filters)));
      }
    }

    for (const date of [...new Set(files.map((file) => file.date))]) {
      const filters = { from: date, to: date };
      expectSummary(repository.querySummary(filters), sumRows(filteredRows(rows, filters)));
    }

    const representative = rows[0];
    expect(representative).toBeDefined();
    const combined: LocalFilters = {
      from: representative!.date,
      to: representative!.date,
      machine: [representative!.machine],
      agent: [representative!.agent],
      provider: [representative!.provider],
      model: [representative!.model],
    };
    const combinedSummary = repository.querySummary(combined);
    expectSummary(combinedSummary, sumRows(filteredRows(rows, combined)));
    expect(combinedSummary.requests).toBeGreaterThan(0);
  });
});

interface BackfillRow extends SnapshotTotals {
  date: string;
  machine: string;
  agent: string;
  provider: string;
  model: string;
}

function filteredRows(rows: readonly BackfillRow[], filters: LocalFilters): BackfillRow[] {
  return rows.filter((row) =>
    (!filters.from || row.date >= filters.from) &&
    (!filters.to || row.date <= filters.to) &&
    includes(filters.machine, row.machine) &&
    includes(filters.agent, row.agent) &&
    includes(filters.provider, row.provider) &&
    includes(filters.model, row.model),
  );
}

function includes(values: readonly string[] | undefined, value: string): boolean {
  return !values?.length || values.includes(value);
}

function sumRows(rows: readonly SnapshotTotals[]): SnapshotTotals {
  const totals: SnapshotTotals = {
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

function expectSummary(actual: SnapshotTotals, expected: SnapshotTotals): void {
  expect(actual.requests).toBe(expected.requests);
  expect(actual.inputTokens).toBe(expected.inputTokens);
  expect(actual.outputTokens).toBe(expected.outputTokens);
  expect(actual.reasoningTokens).toBe(expected.reasoningTokens);
  expect(actual.cacheReadTokens).toBe(expected.cacheReadTokens);
  expect(actual.cacheWriteTokens).toBe(expected.cacheWriteTokens);
  expect(actual.estimatedCost).toBeCloseTo(expected.estimatedCost, 10);
  expect(actual.billedCost).toBeCloseTo(expected.billedCost, 10);
  expect(actual.unpricedRequests).toBe(expected.unpricedRequests);
}

function totalTokens(totals: SnapshotTotals): number {
  return totals.inputTokens + totals.outputTokens + totals.reasoningTokens + totals.cacheReadTokens + totals.cacheWriteTokens;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function sumMatrix(matrix: readonly (readonly number[])[]): number {
  return sum(matrix.flat());
}
