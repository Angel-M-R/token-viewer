import { gunzipSync } from "node:zlib";
import type { Hono } from "hono";
import { ingestRequestSchema, type UsageRecord } from "@tokenviewer/core";
import type { AppContext } from "../app.js";
import { resolveMachine } from "../auth.js";
import { loadPricingCatalog, priceUsageRecord } from "../pricing/index.js";

export function registerIngestRoutes(app: Hono, context: AppContext): void {
  app.post("/api/v1/ingest", async (c) => {
    const machine = resolveMachine(c, context);
    if (machine instanceof Response) {
      return machine;
    }

    const body = await readJsonBody(c.req.raw);
    const parsed = ingestRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid request", issues: parsed.error.issues }, 400);
    }

    const catalog = await loadPricingCatalog(context.db);
    const insert = context.db.sqlite.prepare(`
      INSERT INTO usage_records (
        machine_id, record_hash, agent, provider, model, ts, session, project,
        input_tokens, output_tokens, reasoning_tokens, cache_read_tokens, cache_write_tokens,
        cost_usd, billed_cost_usd, pricing_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(machine_id, record_hash) DO NOTHING
    `);

    let accepted = 0;
    context.db.sqlite.exec("BEGIN");
    try {
      for (const record of parsed.data.records) {
        const priced = priceUsageRecord(record, catalog);
        const result = insert.run(
          machine.id,
          record.recordHash,
          record.agent,
          record.provider ?? null,
          record.model ?? null,
          normalizeTimestamp(record),
          record.session ?? null,
          record.project ?? null,
          record.inputTokens,
          record.outputTokens,
          record.reasoningTokens,
          record.cacheReadTokens,
          record.cacheWriteTokens,
          priced.costUsd,
          record.billedCost ?? null,
          priced.pricingSource,
        );
        accepted += Number(result.changes);
      }

      context.db.sqlite
        .prepare("UPDATE machines SET last_seen_at = ? WHERE id = ?")
        .run(new Date().toISOString(), machine.id);
      context.db.sqlite.exec("COMMIT");
    } catch (error) {
      context.db.sqlite.exec("ROLLBACK");
      throw error;
    }

    return c.json({
      accepted,
      duplicates: parsed.data.records.length - accepted,
    });
  });
}

async function readJsonBody(request: Request): Promise<unknown> {
  const bytes = Buffer.from(await request.arrayBuffer());
  const raw =
    request.headers.get("content-encoding")?.toLowerCase() === "gzip" ? gunzipSync(bytes) : bytes;
  return JSON.parse(raw.toString("utf-8")) as unknown;
}

function normalizeTimestamp(record: UsageRecord): string {
  const value = record.timestamp ? new Date(record.timestamp) : new Date();
  return Number.isFinite(value.getTime()) ? value.toISOString() : new Date().toISOString();
}
