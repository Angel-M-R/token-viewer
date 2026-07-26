import { Buffer } from "node:buffer";
import type { Hono } from "hono";
import type { AppContext } from "../app.js";
import { requireDashboard } from "../auth.js";
import { compileFilters } from "./filters.js";

export function registerRecordsRoutes(app: Hono, context: AppContext): void {
  app.get("/api/v1/records", (c) => {
    const unauthorized = requireDashboard(c, context);
    if (unauthorized) return unauthorized;
    const filters = compileFilters(c);
    if (filters instanceof Response) return filters;

    const url = new URL(c.req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100), 1), 500);
    const cursor = decodeCursor(url.searchParams.get("cursor"));
    const clauses = filters.where ? [filters.where.slice("WHERE ".length)] : [];
    const params = [...filters.params];

    if (cursor) {
      clauses.push("(u.ts < ? OR (u.ts = ? AND u.id < ?))");
      params.push(cursor.ts, cursor.ts, cursor.id);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = context.db.sqlite
      .prepare(
        `
        SELECT
          u.id,
          m.name AS machine,
          u.record_hash AS recordHash,
          u.agent,
          u.provider,
          u.model,
          u.ts AS timestamp,
          u.session,
          u.project,
          u.billed_cost_usd AS billedCost,
          u.input_tokens AS inputTokens,
          u.output_tokens AS outputTokens,
          u.reasoning_tokens AS reasoningTokens,
          u.cache_read_tokens AS cacheReadTokens,
          u.cache_write_tokens AS cacheWriteTokens,
          '' AS sourceFile
        FROM usage_records u
        JOIN machines m ON m.id = u.machine_id
        ${where}
        ORDER BY u.ts DESC, u.id DESC
        LIMIT ?
      `,
      )
      .all(...(params as never[]), limit + 1) as Array<
      Record<string, unknown> & { id: number; timestamp: string }
    >;

    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return c.json({
      rows: page,
      nextCursor: rows.length > limit && last ? encodeCursor({ ts: last.timestamp, id: last.id }) : undefined,
    });
  });
}

function encodeCursor(cursor: { ts: string; id: number }): string {
  return Buffer.from(JSON.stringify(cursor), "utf-8").toString("base64url");
}

function decodeCursor(value: string | null): { ts: string; id: number } | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf-8")) as {
      ts?: unknown;
      id?: unknown;
    };
    return typeof parsed.ts === "string" && typeof parsed.id === "number"
      ? { ts: parsed.ts, id: parsed.id }
      : null;
  } catch {
    return null;
  }
}
