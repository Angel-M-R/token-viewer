import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFilePricingCatalogCache,
  loadPricingCatalog,
  priceUsageRecord,
  type PricingCatalog,
  type PricingCatalogCache,
  type UsageRecord,
} from "../src/index.js";

const NOW = new Date("2026-07-27T12:00:00.000Z");
const CATALOG = {
  openai: {
    models: {
      "gpt-test": {
        cost: { input: 10, output: 20, cache_read: 1, cache_write: 5 },
      },
    },
  },
};

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("local pricing", () => {
  it("uses a fresh local file cache without fetching", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tokenviewer-pricing-"));
    temporaryDirectories.push(directory);
    const cache = createFilePricingCatalogCache(join(directory, "models.json"));
    await cache.write({ fetchedAt: "2026-07-27T11:00:00.000Z", catalog: CATALOG });
    const fetcher = vi.fn<typeof fetch>();

    const pricing = await loadPricingCatalog(cache, { fetcher, now: () => NOW });

    expect(pricing).toMatchObject({ source: "catalog", catalog: CATALOG });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses a stale cache when refreshing fails", async () => {
    const cache = memoryCache({ fetchedAt: "2026-07-01T00:00:00.000Z", catalog: CATALOG });
    const pricing = await loadPricingCatalog(cache, {
      fetcher: vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")),
      now: () => NOW,
    });

    expect(pricing.source).toBe("stale-catalog");
    expect(priceUsageRecord(record({ model: "gpt-test" }), pricing)).toMatchObject({
      costUsd: 0.00001,
      pricingSource: "stale-catalog",
    });
  });

  it("falls back with alias and provider inference when no cache is usable", async () => {
    const pricing = await loadPricingCatalog(memoryCache(null), {
      fetcher: vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")),
      now: () => NOW,
    });

    expect(pricing.source).toBe("fallback");
    expect(
      priceUsageRecord(record({ provider: undefined, model: "gpt-5.5-chat-latest", inputTokens: 100_000 }), pricing),
    ).toEqual({ costUsd: 0.5, pricingSource: "fallback" });
  });

  it("distinguishes unknown pricing from a stored billed cost", () => {
    const pricing: PricingCatalog = { source: "fallback" };

    expect(priceUsageRecord(record({ provider: undefined, model: "not-a-model" }), pricing)).toEqual({
      costUsd: null,
      pricingSource: "unknown",
    });
    expect(
      priceUsageRecord(record({ provider: undefined, model: "not-a-model", billedCost: 0.25 }), pricing),
    ).toEqual({ costUsd: null, pricingSource: "stored" });
  });

  it("uses the long-context tier before aggregation", () => {
    const pricing: PricingCatalog = { source: "fallback" };

    expect(
      priceUsageRecord(record({ model: "gpt-5.5", inputTokens: 200_001 }), pricing),
    ).toEqual({ costUsd: 2.00001, pricingSource: "fallback" });
  });
});

function memoryCache(initial: { fetchedAt: string; catalog: unknown } | null): PricingCatalogCache {
  let entry = initial;
  return {
    async read() {
      return entry;
    },
    async write(next) {
      entry = next;
    },
  };
}

function record(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    agent: "codex",
    provider: "openai",
    model: "gpt-test",
    timestamp: "2026-07-27T10:30:00.000Z",
    inputTokens: 1,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    sourceFile: "/private/source.jsonl",
    recordHash: "a".repeat(64),
    ...overrides,
  };
}
