import type { UsageRecord } from "@tokenviewer/core";
import {
  loadPricingCatalog as loadLocalPricingCatalog,
  priceUsageRecord,
  type PricingCatalog,
  type PricingCatalogCache,
  type PricingOptions,
} from "@tokenviewer/core/pricing";
import type { DbClient } from "../db/client.js";

export { priceUsageRecord };
export type {
  PricedRecord,
  PricingCatalog,
  PricingCatalogCache,
  PricingCatalogCacheEntry,
  PricingOptions,
  PricingSource,
} from "@tokenviewer/core/pricing";

export async function loadPricingCatalog(
  db: DbClient,
  options: PricingOptions = {},
): Promise<PricingCatalog> {
  return loadLocalPricingCatalog(sqlitePricingCache(db), options);
}

export async function repriceAll(db: DbClient, options: PricingOptions = {}): Promise<number> {
  const catalog = await loadPricingCatalog(db, options);
  const rows = db.sqlite.prepare("SELECT * FROM usage_records").all() as unknown as UsageRecordRow[];
  const update = db.sqlite.prepare(
    "UPDATE usage_records SET cost_usd = ?, pricing_source = ? WHERE id = ?",
  );

  db.sqlite.exec("BEGIN");
  try {
    for (const row of rows) {
      const priced = priceUsageRecord(rowToUsageRecord(row), catalog);
      update.run(priced.costUsd, priced.pricingSource, row.id);
    }
    db.sqlite.exec("COMMIT");
    return rows.length;
  } catch (error) {
    db.sqlite.exec("ROLLBACK");
    throw error;
  }
}

function sqlitePricingCache(db: DbClient): PricingCatalogCache {
  return {
    async read() {
      const row = db.sqlite
        .prepare("SELECT fetched_at, payload FROM pricing_catalog WHERE id = 1")
        .get() as { fetched_at: string; payload: string } | undefined;
      if (!row) return null;
      try {
        return { fetchedAt: row.fetched_at, catalog: JSON.parse(row.payload) as unknown };
      } catch {
        return null;
      }
    },
    async write(entry) {
      db.sqlite
        .prepare(
          "INSERT INTO pricing_catalog (id, fetched_at, payload) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET fetched_at = excluded.fetched_at, payload = excluded.payload",
        )
        .run(entry.fetchedAt, JSON.stringify(entry.catalog));
    },
  };
}

function rowToUsageRecord(row: UsageRecordRow): UsageRecord {
  return {
    agent: row.agent,
    provider: row.provider ?? undefined,
    model: row.model ?? undefined,
    timestamp: row.ts,
    session: row.session ?? undefined,
    project: row.project ?? undefined,
    billedCost: row.billed_cost_usd ?? undefined,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    reasoningTokens: row.reasoning_tokens,
    cacheReadTokens: row.cache_read_tokens,
    cacheWriteTokens: row.cache_write_tokens,
    sourceFile: "",
    recordHash: row.record_hash,
  };
}

interface UsageRecordRow {
  id: number;
  record_hash: string;
  agent: string;
  provider: string | null;
  model: string | null;
  ts: string;
  session: string | null;
  project: string | null;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  billed_cost_usd: number | null;
}
