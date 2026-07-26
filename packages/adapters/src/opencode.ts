import { stat } from "node:fs/promises";
import {
  opencodeDatabasePaths,
  type Adapter,
  type UsageOptions,
  type UsageRecord,
} from "@tokenviewer/core";
import { completeSqliteSource, shouldUseSqliteSource } from "./source-files.js";
import { openReadonlySqliteDatabase, type SqliteDatabase } from "./sqlite.js";
import { numberValue, stringValue, withRecordHash } from "./utils.js";

export function opencodeAdapter(): Adapter {
  return {
    name: "opencode",
    async detect(): Promise<boolean> {
      for (const dbPath of opencodeDatabasePaths()) {
        if (await stat(dbPath).catch(() => null)) {
          return true;
        }
      }
      return false;
    },
    async *usage(options?: UsageOptions): AsyncGenerator<UsageRecord> {
      const dbPath = await findOpencodeDatabase();
      if (!dbPath || !(await shouldUseSqliteSource(dbPath, options))) {
        return;
      }

      const db = await openReadonlySqliteDatabase(dbPath);
      if (!db) {
        options?.onWarning?.("SQLite support not available, skipping opencode");
        options?.onFileSkipped?.(dbPath, "unsupported");
        return;
      }

      try {
        yield* queryUsageRecords(db, dbPath, options);
        await completeSqliteSource(dbPath, options);
      } finally {
        db.close();
      }
    },
  };
}

async function findOpencodeDatabase(): Promise<string | null> {
  for (const dbPath of opencodeDatabasePaths()) {
    if (await stat(dbPath).catch(() => null)) {
      return dbPath;
    }
  }

  return null;
}

function* queryUsageRecords(
  db: SqliteDatabase,
  sourceFile: string,
  options?: UsageOptions,
): Generator<UsageRecord> {
  let where = `WHERE json_type(data, '$.tokens') = 'object'`;
  const params: unknown[] = [];

  if (options?.since) {
    where += ` AND time_created >= ?`;
    params.push(options.since.getTime());
  }

  const rows = db
    .prepare(`
    SELECT
      id,
      session_id,
      time_created,
      COALESCE(json_extract(data, '$.providerID'), json_extract(data, '$.model.providerID')) AS provider,
      COALESCE(json_extract(data, '$.modelID'), json_extract(data, '$.model.modelID')) AS model,
      json_extract(data, '$.cost') AS billed_cost,
      json_extract(data, '$.tokens.input') AS input_tokens,
      json_extract(data, '$.tokens.output') AS output_tokens,
      json_extract(data, '$.tokens.reasoning') AS reasoning_tokens,
      json_extract(data, '$.tokens.cache.read') AS cache_read_tokens,
      json_extract(data, '$.tokens.cache.write') AS cache_write_tokens
    FROM message
    ${where}
    ORDER BY time_created ASC
  `)
    .all(...params) as {
    id: string | null;
    session_id: string | null;
    time_created: number | null;
    provider: string | null;
    model: string | null;
    billed_cost: number | null;
    input_tokens: number | null;
    output_tokens: number | null;
    reasoning_tokens: number | null;
    cache_read_tokens: number | null;
    cache_write_tokens: number | null;
  }[];

  for (const row of rows) {
    const inputTokens = numberValue(row.input_tokens);
    const outputTokens = numberValue(row.output_tokens);
    const reasoningTokens = numberValue(row.reasoning_tokens);
    const cacheReadTokens = numberValue(row.cache_read_tokens);
    const cacheWriteTokens = numberValue(row.cache_write_tokens);
    const billedCost = numberValue(row.billed_cost);

    if (
      inputTokens + outputTokens + reasoningTokens + cacheReadTokens + cacheWriteTokens === 0 &&
      billedCost === 0
    ) {
      continue;
    }

    yield withRecordHash({
      agent: "opencode",
      provider: stringValue(row.provider),
      model: stringValue(row.model),
      timestamp: row.time_created ? new Date(row.time_created).toISOString() : undefined,
      session: stringValue(row.session_id),
      billedCost,
      inputTokens,
      outputTokens,
      reasoningTokens,
      cacheReadTokens,
      cacheWriteTokens,
      sourceFile,
      nativeId: stringValue(row.id) ?? `${row.session_id ?? ""}:${row.time_created ?? ""}`,
    });
  }
}
