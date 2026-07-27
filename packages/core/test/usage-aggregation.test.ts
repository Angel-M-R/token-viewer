import { describe, expect, it } from "vitest";
import {
  aggregateUsageRecords,
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
  it("deduplicates, prices each record, and aggregates every metric by UTC dimensions", () => {
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
      [priced, { ...priced }, record("b", { timestamp: "2026-07-27T10:59:00.000Z" })],
      "angel-mac",
      PRICING,
    );

    expect(result).toMatchObject({ machine: "angel-mac", duplicateRecords: 1, skippedRecords: 0 });
    expect(result.days).toHaveLength(1);
    expect(result.days[0]?.usage).toEqual([
      {
        hour: "2026-07-27T10:00:00.000Z",
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
    expect(result.days[0]?.totals).toEqual(result.days[0]?.usage[0] && {
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
    expect(JSON.stringify(result)).not.toMatch(/recordHash|sourceFile|session|project|private/);
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

  it("separates rows by agent, provider, model, and UTC hour", () => {
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

    expect(result.days[0]?.usage).toHaveLength(5);
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
