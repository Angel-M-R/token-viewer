import type { Hono } from "hono";
import { quotaSnapshotsResponseSchema } from "@tokenviewer/core";
import { z } from "zod";
import type { AppContext } from "../app.js";
import { requireDashboard, resolveMachine } from "../auth.js";

const DEDUP_WINDOW_MS = 5 * 60 * 1000;
const legacyQuotaSnapshotSchema = z.object({
  provider: z.string().min(1),
  takenAt: z.string().datetime({ offset: true }),
  percentUsed: z.number().finite().min(0).max(100).optional(),
  plan: z.string().min(1).optional(),
  resetsAt: z.string().datetime({ offset: true }).optional(),
  raw: z.record(z.string(), z.unknown()),
});
const legacyQuotaIngestRequestSchema = z.object({ snapshot: legacyQuotaSnapshotSchema });
const legacyQuotaIngestResponseSchema = z.object({
  accepted: z.boolean(),
  reason: z.string().optional(),
});

export function registerQuotaRoutes(app: Hono, context: AppContext): void {
  app.post("/api/v1/ingest-quota", async (c) => {
    const machine = resolveMachine(c, context);
    if (machine instanceof Response) {
      return machine;
    }

    const parsed = legacyQuotaIngestRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "invalid request", issues: parsed.error.issues }, 400);
    }

    const snapshot = parsed.data.snapshot;
    const latest = context.db.sqlite
      .prepare(
        "SELECT taken_at FROM quota_snapshots WHERE machine_id = ? AND provider = ? ORDER BY taken_at DESC, id DESC LIMIT 1",
      )
      .get(machine.id, snapshot.provider) as { taken_at: string } | undefined;
    const latestTime = latest ? new Date(latest.taken_at).getTime() : 0;
    if (latest && Number.isFinite(latestTime) && Date.now() - latestTime < DEDUP_WINDOW_MS) {
      return c.json(legacyQuotaIngestResponseSchema.parse({ accepted: false, reason: "duplicate" }));
    }

    context.db.sqlite
      .prepare(
        `
        INSERT INTO quota_snapshots (
          machine_id, provider, taken_at, percent_used, plan, resets_at, raw
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        machine.id,
        snapshot.provider,
        normalizeTimestamp(snapshot.takenAt),
        snapshot.percentUsed ?? null,
        snapshot.plan ?? null,
        snapshot.resetsAt ? normalizeTimestamp(snapshot.resetsAt) : null,
        JSON.stringify(snapshot.raw),
      );
    context.db.sqlite.prepare("UPDATE machines SET last_seen_at = ? WHERE id = ?").run(new Date().toISOString(), machine.id);

    return c.json(legacyQuotaIngestResponseSchema.parse({ accepted: true }));
  });

  app.get("/api/v1/quota-snapshots", (c) => {
    const unauthorized = requireDashboard(c, context);
    if (unauthorized) return unauthorized;

    const url = new URL(c.req.url);
    const provider = url.searchParams.get("provider") || "copilot";
    const filters = quotaFilters(url);
    if (filters instanceof Response) return filters;

    const clauses = ["provider = ?"];
    const params: unknown[] = [provider];
    if (filters.from) {
      clauses.push("taken_at >= ?");
      params.push(filters.from);
    }
    if (filters.to) {
      clauses.push("taken_at <= ?");
      params.push(filters.to);
    }

    const rows = context.db.sqlite
      .prepare(
        `
        SELECT provider, taken_at AS takenAt, percent_used AS percentUsed, plan, resets_at AS resetsAt, raw
        FROM quota_snapshots
        WHERE ${clauses.join(" AND ")}
        ORDER BY taken_at ASC, id ASC
      `,
      )
      .all(...(params as never[])) as Array<{
      provider: string;
      takenAt: string;
      percentUsed: number | null;
      plan: string | null;
      resetsAt: string | null;
      raw: string;
    }>;

    const accounts = new Map<
      string,
      {
        account: string;
        provider: string;
        latest: {
          takenAt: string;
          percentUsed?: number;
          plan: string | null;
          resetsAt: string | null;
        };
        points: Map<string, { takenAt: string; percentUsed?: number }>;
      }
    >();

    for (const row of rows) {
      const raw = parseRaw(row.raw);
      const account = accountFromRaw(raw);
      const current = accounts.get(account) ?? {
        account,
        provider: row.provider,
        latest: {
          takenAt: row.takenAt,
          percentUsed: nullableNumber(row.percentUsed),
          plan: row.plan,
          resetsAt: row.resetsAt,
        },
        points: new Map<string, { takenAt: string; percentUsed?: number }>(),
      };
      current.latest = {
        takenAt: row.takenAt,
        percentUsed: nullableNumber(row.percentUsed),
        plan: row.plan,
        resetsAt: row.resetsAt,
      };
      current.points.set(row.takenAt, {
        takenAt: row.takenAt,
        percentUsed: nullableNumber(row.percentUsed),
      });
      accounts.set(account, current);
    }

    return c.json(
      quotaSnapshotsResponseSchema.parse({
        provider,
        accounts: [...accounts.values()].map((account) => ({
          account: account.account,
          provider: account.provider,
          latest: account.latest,
          series: [...account.points.values()].sort((left, right) => left.takenAt.localeCompare(right.takenAt)),
        })),
      }),
    );
  });
}

function quotaFilters(url: URL): { from?: string; to?: string } | Response {
  try {
    return {
      from: normalizeDateParam(url.searchParams.get("from"), "start"),
      to: normalizeDateParam(url.searchParams.get("to"), "end"),
    };
  } catch (error) {
    return new Response(JSON.stringify({ error: "invalid filters", message: (error as Error).message }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
}

function normalizeDateParam(value: string | null, boundary: "start" | "end"): string | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return boundary === "start" ? `${value}T00:00:00.000Z` : `${value}T23:59:59.999Z`;
  }
  return normalizeTimestamp(value);
}

function normalizeTimestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("invalid timestamp");
  }
  return date.toISOString();
}

function parseRaw(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function accountFromRaw(raw: Record<string, unknown>): string {
  return (
    stringValue(raw["login"]) ??
    stringValue(recordValue(raw["user"])?.["login"]) ??
    stringValue(recordValue(raw["github"])?.["login"]) ??
    stringValue(recordValue(raw["viewer"])?.["login"]) ??
    "unknown"
  );
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function nullableNumber(value: number | null): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
