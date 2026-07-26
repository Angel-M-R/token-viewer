import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const machines = sqliteTable("machines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  os: text("os"),
  tokenHash: text("token_hash").notNull(),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at"),
});

export const usageRecords = sqliteTable(
  "usage_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    machineId: integer("machine_id").notNull().references(() => machines.id),
    recordHash: text("record_hash").notNull(),
    agent: text("agent").notNull(),
    provider: text("provider"),
    model: text("model"),
    ts: text("ts").notNull(),
    session: text("session"),
    project: text("project"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    costUsd: real("cost_usd"),
    billedCostUsd: real("billed_cost_usd"),
    pricingSource: text("pricing_source"),
  },
  (table) => [
    uniqueIndex("usage_records_machine_hash_unique").on(table.machineId, table.recordHash),
    index("usage_records_ts_idx").on(table.ts),
    index("usage_records_machine_ts_idx").on(table.machineId, table.ts),
    index("usage_records_agent_ts_idx").on(table.agent, table.ts),
    index("usage_records_model_ts_idx").on(table.model, table.ts),
  ],
);

export const quotaSnapshots = sqliteTable(
  "quota_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    machineId: integer("machine_id").notNull().references(() => machines.id),
    provider: text("provider").notNull(),
    takenAt: text("taken_at").notNull(),
    percentUsed: real("percent_used"),
    plan: text("plan"),
    resetsAt: text("resets_at"),
    raw: text("raw").notNull(),
  },
  (table) => [index("quota_snapshots_machine_provider_taken_idx").on(table.machineId, table.provider, table.takenAt)],
);

export const pricingCatalog = sqliteTable("pricing_catalog", {
  id: integer("id").primaryKey().default(1),
  fetchedAt: text("fetched_at").notNull(),
  payload: text("payload").notNull(),
});
