import { describe, expect, it } from "vitest";
import { localQuotaSnapshotsResponseSchema } from "./contracts";
import { loadSnapshotModules } from "./snapshotLoader";
import {
  InvalidLocalQueryError,
  InvalidTimeZoneError,
  LocalSnapshotRepository,
} from "./repository";
import { representativeRepository, representativeSnapshotModules } from "./testFixtures";

describe("local snapshot repository", () => {
  it("exposes all snapshot identities and applies every dimension with an inclusive date range", () => {
    const repository = representativeRepository();

    expect(repository.queryAvailableFilters()).toEqual({
      machines: ["angel-mac", "old-mac", "mac-m5"],
      agents: ["claude", "codex"],
      providers: ["anthropic", "copilot", "openai"],
      models: ["claude-opus", "gpt-5", "unknown"],
    });
    expect(repository.queryMachines().map((machine) => machine.name)).toEqual([
      "angel-mac",
      "old-mac",
      "mac-m5",
    ]);
    expect(repository.querySummary({
      from: "2026-07-04",
      to: "2026-07-04",
      machine: ["angel-mac"],
      agent: ["codex"],
      provider: ["openai"],
      model: ["gpt-5"],
    }).requests).toBe(2);
  });

  it("serves every aggregate view for active and historical identities and preserves unknown prices", () => {
    const repository = representativeRepository();
    const unknown = { machine: ["angel-mac"], model: ["unknown"] };

    expect(repository.querySummary(unknown)).toMatchObject({
      requests: 1,
      estimatedCost: 0,
      billedCost: 0.4,
      unpricedRequests: 1,
      modelCount: 1,
    });

    for (const [machine, requests] of [
      ["angel-mac", 6],
      ["old-mac", 4],
      ["mac-m5", 5],
    ] as const) {
      const filters = { machine: [machine] };
      expect(repository.querySummary(filters).requests).toBe(requests);
      expect(sum(repository.queryDaily(filters, "machine").rows.map((row) => row.requests))).toBe(requests);
      expect(sum(repository.queryCalendarHeatmap(filters).rows.map((row) => row.requests))).toBe(requests);
      expect(sum(repository.queryModels(filters).rows.map((row) => row.requests))).toBe(requests);
      expect(sum(repository.queryHourlyHeatmap(filters, "requests", "UTC").matrix.flat())).toBe(requests);
      expect(repository.queryQuotas(filters).groups.map((group) => group.machine)).toEqual([machine]);
    }

    expect(repository.queryDaily({}, "agent").rows).toHaveLength(3);
    expect(repository.queryCalendarHeatmap().rows).toHaveLength(2);
    expect(repository.queryModels().rows).toHaveLength(3);
    expect(repository.queryHourlyHeatmap({}, "requests", "UTC").matrix[6]?.[10]).toBe(4);
  });

  it("returns zeroed aggregates for an empty range and controls invalid ranges", () => {
    const repository = representativeRepository();

    expect(repository.querySummary({ from: "2027-01-01", to: "2027-01-31" })).toEqual({
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      estimatedCost: 0,
      billedCost: 0,
      unpricedRequests: 0,
      modelCount: 0,
    });
    expect(repository.queryDaily({ from: "2027-01-01" }).rows).toEqual([]);
    expect(() => repository.querySummary({ from: "2026-07-05", to: "2026-07-04" })).toThrow(
      InvalidLocalQueryError,
    );
  });

  it("converts UTC hourly rows to an IANA timezone and rejects invalid zones", () => {
    const repository = representativeRepository();
    const heatmap = repository.queryHourlyHeatmap(
      { machine: ["angel-mac"], agent: ["codex"], from: "2026-07-04", to: "2026-07-04" },
      "requests",
      "Europe/Madrid",
    );

    expect(heatmap.matrix[0]?.[1]).toBe(2);
    expect(() => repository.queryHourlyHeatmap({}, "tokens", "Mars/Olympus")).toThrow(
      InvalidTimeZoneError,
    );
  });

  it("groups quotas by machine and provider with latest values and deduplicated history", () => {
    const files = loadSnapshotModules(representativeSnapshotModules);
    const repository = new LocalSnapshotRepository([...files, files[0]!]);
    const response = repository.queryQuotas({}, "copilot");

    expect(localQuotaSnapshotsResponseSchema.parse(response)).toEqual(response);
    expect(response.groups.map((group) => group.machine)).toEqual([
      "angel-mac",
      "old-mac",
      "mac-m5",
    ]);
    expect(response.groups[0]?.latest.percentUsed).toBe(60);
    expect(response.groups[0]?.series).toHaveLength(2);
    expect(response.groups[1]?.series).toHaveLength(1);
    expect(response.groups[2]?.series).toHaveLength(1);
    expect(JSON.stringify({
      summary: repository.querySummary(),
      daily: repository.queryDaily(),
      models: repository.queryModels(),
      quota: response,
    })).not.toMatch(/login|account|session|project|sourceFile|recordHash/i);
  });
});

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
