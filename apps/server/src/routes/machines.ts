import type { Hono } from "hono";
import {
  machineRegisterRequestSchema,
  machineRegisterResponseSchema,
  type MachineListItem,
} from "@tokenviewer/core";
import type { AppContext } from "../app.js";
import { generateMachineToken, hashToken, requireAdmin, requireAdminOrDashboard } from "../auth.js";

export function registerMachineRoutes(app: Hono, context: AppContext): void {
  app.post("/api/v1/machines/register", async (c) => {
    const unauthorized = requireAdmin(c, context);
    if (unauthorized) {
      return unauthorized;
    }

    const parsed = machineRegisterRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "invalid request", issues: parsed.error.issues }, 400);
    }

    const now = new Date().toISOString();
    const machineToken = generateMachineToken();
    const tokenHash = hashToken(machineToken);
    const existing = context.db.sqlite
      .prepare("SELECT id, created_at FROM machines WHERE name = ?")
      .get(parsed.data.name) as { id: number; created_at: string } | undefined;

    let id: number;
    if (existing) {
      context.db.sqlite
        .prepare("UPDATE machines SET os = ?, token_hash = ? WHERE id = ?")
        .run(parsed.data.os ?? null, tokenHash, existing.id);
      id = existing.id;
    } else {
      const result = context.db.sqlite
        .prepare("INSERT INTO machines (name, os, token_hash, created_at) VALUES (?, ?, ?, ?)")
        .run(parsed.data.name, parsed.data.os ?? null, tokenHash, now);
      id = Number(result.lastInsertRowid);
    }

    const response = machineRegisterResponseSchema.parse({
      id,
      name: parsed.data.name,
      os: parsed.data.os,
      machineToken,
    });
    return c.json(response);
  });

  app.get("/api/v1/machines", (c) => {
    const unauthorized = requireAdminOrDashboard(c, context);
    if (unauthorized) {
      return unauthorized;
    }

    const rows = context.db.sqlite
      .prepare(
        `
        SELECT
          m.id,
          m.name,
          m.os,
          m.created_at AS createdAt,
          m.last_seen_at AS lastSeenAt,
          COUNT(u.id) AS requests,
          COALESCE(SUM(u.input_tokens), 0) AS inputTokens,
          COALESCE(SUM(u.output_tokens), 0) AS outputTokens,
          COALESCE(SUM(u.reasoning_tokens), 0) AS reasoningTokens,
          COALESCE(SUM(u.cache_read_tokens), 0) AS cacheReadTokens,
          COALESCE(SUM(u.cache_write_tokens), 0) AS cacheWriteTokens
        FROM machines m
        LEFT JOIN usage_records u ON u.machine_id = m.id
        GROUP BY m.id
        ORDER BY m.name ASC
      `,
      )
      .all() as MachineListItem[];

    return c.json({ machines: rows.map(normalizeMachineRow) });
  });
}

function normalizeMachineRow(row: MachineListItem): MachineListItem {
  return {
    ...row,
    requests: Number(row.requests),
    inputTokens: Number(row.inputTokens),
    outputTokens: Number(row.outputTokens),
    reasoningTokens: Number(row.reasoningTokens),
    cacheReadTokens: Number(row.cacheReadTokens),
    cacheWriteTokens: Number(row.cacheWriteTokens),
  };
}
