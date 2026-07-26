import type { Hono } from "hono";
import type { AppContext } from "../app.js";
import { requireDashboard } from "../auth.js";
import { compileFilters } from "./filters.js";

type GroupBy = "none" | "agent" | "model" | "machine";

export function registerStatsRoutes(app: Hono, context: AppContext): void {
  app.get("/api/v1/stats/summary", (c) => {
    const unauthorized = requireDashboard(c, context);
    if (unauthorized) return unauthorized;
    const filters = compileFilters(c);
    if (filters instanceof Response) return filters;

    const row = context.db.sqlite
      .prepare(
        `
        SELECT
          COUNT(*) AS requests,
          COALESCE(SUM(u.input_tokens), 0) AS inputTokens,
          COALESCE(SUM(u.output_tokens), 0) AS outputTokens,
          COALESCE(SUM(u.reasoning_tokens), 0) AS reasoningTokens,
          COALESCE(SUM(u.cache_read_tokens), 0) AS cacheReadTokens,
          COALESCE(SUM(u.cache_write_tokens), 0) AS cacheWriteTokens,
          COALESCE(SUM(u.cost_usd), 0) AS estimatedCost,
          COALESCE(SUM(u.billed_cost_usd), 0) AS billedCost,
          COALESCE(SUM(CASE WHEN u.cost_usd IS NULL THEN 1 ELSE 0 END), 0) AS unpricedRequests,
          COUNT(DISTINCT u.model) AS modelCount
        FROM usage_records u
        JOIN machines m ON m.id = u.machine_id
        ${filters.where}
      `,
      )
      .get(...(filters.params as never[])) as Record<string, unknown>;

    return c.json(numberRow(row));
  });

  app.get("/api/v1/stats/daily", (c) => {
    const unauthorized = requireDashboard(c, context);
    if (unauthorized) return unauthorized;
    const url = new URL(c.req.url);
    const groupBy = (url.searchParams.get("groupBy") ?? "none") as GroupBy;
    if (!["none", "agent", "model", "machine"].includes(groupBy)) {
      return c.json({ error: "invalid groupBy" }, 400);
    }
    const filters = compileFilters(c, {
      dateExpression: "strftime('%Y-%m-%d', u.ts)",
      dateOnly: true,
    });
    if (filters instanceof Response) return filters;

    const groupExpression =
      groupBy === "agent"
        ? "u.agent"
        : groupBy === "model"
          ? "u.model"
          : groupBy === "machine"
            ? "m.name"
            : "NULL";
    const needsMachineJoin = groupBy === "machine" || url.searchParams.has("machine");
    const joinClause = needsMachineJoin ? "JOIN machines m ON m.id = u.machine_id" : "";
    const index =
      groupBy === "agent"
        ? "usage_records_day_agent_cover_idx"
        : groupBy === "model"
          ? "usage_records_day_model_idx"
          : groupBy === "machine"
            ? "usage_records_day_machine_idx"
            : "usage_records_day_idx";
    const rows = context.db.sqlite
      .prepare(
        `
        SELECT
          strftime('%Y-%m-%d', u.ts) AS day,
          ${groupExpression} AS "group",
          COUNT(*) AS requests,
          COALESCE(SUM(u.input_tokens), 0) AS inputTokens,
          COALESCE(SUM(u.output_tokens), 0) AS outputTokens,
          COALESCE(SUM(u.reasoning_tokens), 0) AS reasoningTokens,
          COALESCE(SUM(u.cache_read_tokens), 0) AS cacheReadTokens,
          COALESCE(SUM(u.cache_write_tokens), 0) AS cacheWriteTokens,
          COALESCE(SUM(u.cost_usd), 0) AS estimatedCost,
          COALESCE(SUM(u.billed_cost_usd), 0) AS billedCost
        FROM usage_records AS u INDEXED BY ${index}
        ${joinClause}
        ${filters.where}
        GROUP BY day, "group"
        ORDER BY day ASC, "group" ASC
      `,
      )
      .all(...(filters.params as never[]))
      .map(numberRow);

    return c.json({ groupBy, rows });
  });

  app.get("/api/v1/stats/models", (c) => {
    const unauthorized = requireDashboard(c, context);
    if (unauthorized) return unauthorized;
    const filters = compileFilters(c);
    if (filters instanceof Response) return filters;

    const rows = context.db.sqlite
      .prepare(
        `
        SELECT
          u.provider,
          u.model,
          COUNT(*) AS requests,
          COALESCE(SUM(u.input_tokens), 0) AS inputTokens,
          COALESCE(SUM(u.output_tokens), 0) AS outputTokens,
          COALESCE(SUM(u.reasoning_tokens), 0) AS reasoningTokens,
          COALESCE(SUM(u.cache_read_tokens), 0) AS cacheReadTokens,
          COALESCE(SUM(u.cache_write_tokens), 0) AS cacheWriteTokens,
          COALESCE(SUM(u.cost_usd), 0) AS estimatedCost,
          COALESCE(SUM(u.billed_cost_usd), 0) AS billedCost,
          SUM(CASE WHEN u.cost_usd IS NULL THEN 1 ELSE 0 END) AS unpricedRequests
        FROM usage_records u
        JOIN machines m ON m.id = u.machine_id
        ${filters.where}
        GROUP BY u.provider, u.model
        ORDER BY estimatedCost DESC, requests DESC
      `,
      )
      .all(...(filters.params as never[]))
      .map(numberRow);

    return c.json({ rows });
  });

  app.get("/api/v1/stats/heatmap", (c) => {
    const unauthorized = requireDashboard(c, context);
    if (unauthorized) return unauthorized;
    const filters = compileFilters(c);
    if (filters instanceof Response) return filters;

    const url = new URL(c.req.url);
    const metric = url.searchParams.get("metric") ?? "tokens";
    const tz = url.searchParams.get("tz") ?? "UTC";
    if (!["tokens", "cost", "requests"].includes(metric)) {
      return c.json({ error: "invalid metric" }, 400);
    }
    if (!isValidTimeZone(tz)) {
      return c.json({ error: "invalid tz" }, 400);
    }

    const rows = context.db.sqlite
      .prepare(
        `
        SELECT u.ts, u.input_tokens, u.output_tokens, u.reasoning_tokens, u.cache_read_tokens, u.cache_write_tokens, u.cost_usd
        FROM usage_records u
        JOIN machines m ON m.id = u.machine_id
        ${filters.where}
      `,
      )
      .all(...(filters.params as never[])) as {
      ts: string;
      input_tokens: number;
      output_tokens: number;
      reasoning_tokens: number;
      cache_read_tokens: number;
      cache_write_tokens: number;
      cost_usd: number | null;
    }[];
    const matrix = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));

    for (const row of rows) {
      const parts = localParts(row.ts, tz);
      const value =
        metric === "requests"
          ? 1
          : metric === "cost"
            ? row.cost_usd ?? 0
            : row.input_tokens +
              row.output_tokens +
              row.reasoning_tokens +
              row.cache_read_tokens +
              row.cache_write_tokens;
      matrix[parts.weekday][parts.hour] += value;
    }

    return c.json({ metric, tz, matrix });
  });
}

function numberRow<T extends Record<string, unknown>>(row: T): T {
  const output = { ...row };
  for (const [key, value] of Object.entries(output)) {
    if (typeof value === "bigint") {
      output[key as keyof T] = Number(value) as T[keyof T];
    }
  }
  return output;
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function localParts(ts: string, tz: string): { weekday: number; hour: number } {
  const date = new Date(ts);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const weekdayName = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0) % 24;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayName);
  return { weekday: Math.max(weekday, 0), hour };
}
