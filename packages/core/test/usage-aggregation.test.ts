import { describe, expect, it } from "vitest";
import {
  aggregateUsageRecords,
  discoverAvailableSourceDates,
  type PricingCatalog,
  type UsageRecord,
} from "../src/index.js";

const PRICING: PricingCatalog = {
  source: "catalog",
  catalog: {
    openai: {
      models: {
        "gpt-test": {
          cost: { input: 1, output: 2, cache_read: 0.5, cache_write: 3 },
        },
      },
    },
  },
};

describe("usage aggregation", () => {
  it("deduplicates, prices each record, and aggregates every metric by daily dimensions", () => {
    const priced = record("a", {
      timestamp: "2026-07-27T12:45:00+02:00",
      inputTokens: 10,
      outputTokens: 20,
      reasoningTokens: 30,
      cacheReadTokens: 40,
      cacheWriteTokens: 50,
      billedCost: 0.25,
      session: "private-session",
      project: "private-project",
    });
    const result = aggregateUsageRecords(
      [priced, { ...priced }, record("b", { timestamp: "2026-07-27T20:59:00.000Z" })],
      "angel-mac",
      PRICING,
    );

    expect(result).toMatchObject({ machine: "angel-mac", duplicateRecords: 1, skippedRecords: 0 });
    expect(result.days).toHaveLength(1);
    expect(result.days[0]?.date).toBe("2026-07-27");
    expect(result.days[0]?.usage).toEqual([
      {
        agent: "codex",
        provider: "openai",
        model: "gpt-test",
        requests: 2,
        inputTokens: 20,
        outputTokens: 40,
        reasoningTokens: 60,
        cacheReadTokens: 80,
        cacheWriteTokens: 100,
        estimatedCost: 0.00056,
        billedCost: 0.5,
        unpricedRequests: 0,
      },
    ]);
    expect(result.days[0]?.totals).toEqual({
      requests: 2,
      inputTokens: 20,
      outputTokens: 40,
      reasoningTokens: 60,
      cacheReadTokens: 80,
      cacheWriteTokens: 100,
      estimatedCost: 0.00056,
      billedCost: 0.5,
      unpricedRequests: 0,
    });
    expect(JSON.stringify(result)).not.toMatch(/recordHash|sourceFile|session|project|private|hour/);
  });

  it("assigns each record to its Europe/Madrid local day across DST and day boundaries", () => {
    const result = aggregateUsageRecords(
      [
        record("dst-summer-late-evening", { timestamp: "2026-07-15T23:30:00.000Z" }),
        record("dst-winter", { timestamp: "2026-01-15T23:30:00.000Z" }),
        record("boundary-before", { timestamp: "2026-07-15T21:59:00.000Z" }),
        record("boundary-after", { timestamp: "2026-07-15T22:00:00.000Z" }),
      ],
      "angel-mac",
      PRICING,
    );

    expect(result.days.map((day) => [day.date, day.totals.requests])).toEqual([
      ["2026-01-16", 1],
      ["2026-07-15", 1],
      ["2026-07-16", 2],
    ]);
    expect(discoverAvailableSourceDates([record("x", { timestamp: "2026-07-15T22:00:00.000Z" })])).toEqual([
      "2026-07-16",
    ]);
  });

  it("keeps billed cost while counting unknown dimensions and unpriced requests", () => {
    const result = aggregateUsageRecords(
      [
        record("unknown", {
          provider: undefined,
          model: undefined,
          billedCost: 0.75,
        }),
      ],
      "old-mac",
      PRICING,
    );

    expect(result.days[0]?.usage[0]).toMatchObject({
      provider: "unknown",
      model: "unknown",
      requests: 1,
      estimatedCost: 0,
      billedCost: 0.75,
      unpricedRequests: 1,
    });
  });

  it("separates rows by agent, provider, and model but never by hour", () => {
    const result = aggregateUsageRecords(
      [
        record("a"),
        record("b", { agent: "claude" }),
        record("c", { provider: "anthropic", model: "claude-test" }),
        record("d", { model: "gpt-other" }),
        record("e", { timestamp: "2026-07-27T11:00:00.000Z" }),
      ],
      "angel-mac",
      PRICING,
    );

    expect(result.days).toHaveLength(1);
    expect(result.days[0]?.usage).toHaveLength(4);
  });
});

function record(hash: string, overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    agent: "codex",
    provider: "openai",
    model: "gpt-test",
    timestamp: "2026-07-27T10:30:00.000Z",
    inputTokens: 10,
    outputTokens: 20,
    reasoningTokens: 30,
    cacheReadTokens: 40,
    cacheWriteTokens: 50,
    billedCost: 0.25,
    sourceFile: "/private/source.jsonl",
    recordHash: hash,
    ...overrides,
  };
}
