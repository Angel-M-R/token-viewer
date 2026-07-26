import type { Context } from "hono";
import { z } from "zod";

const filterSchema = z.object({
  from: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
  to: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
});

export interface SqlFilters {
  where: string;
  params: unknown[];
}

export interface CompileFilterOptions {
  dateExpression?: string;
  dateOnly?: boolean;
}

export function compileFilters(c: Context, options: CompileFilterOptions = {}): SqlFilters | Response {
  const url = new URL(c.req.url);
  const parsed = filterSchema.safeParse({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  if (!parsed.success) {
    return c.json({ error: "invalid filters", issues: parsed.error.issues }, 400);
  }

  const clauses: string[] = [];
  const params: unknown[] = [];

  addRepeatedFilter(clauses, params, "m.name", url.searchParams.getAll("machine"));
  addRepeatedFilter(clauses, params, "u.agent", url.searchParams.getAll("agent"));
  addRepeatedFilter(clauses, params, "u.provider", url.searchParams.getAll("provider"));
  addRepeatedFilter(clauses, params, "u.model", url.searchParams.getAll("model"));

  if (parsed.data.from) {
    clauses.push(`${options.dateExpression ?? "u.ts"} >= ?`);
    params.push(options.dateOnly ? normalizeDay(parsed.data.from) : normalizeDate(parsed.data.from, "start"));
  }
  if (parsed.data.to) {
    clauses.push(`${options.dateExpression ?? "u.ts"} <= ?`);
    params.push(options.dateOnly ? normalizeDay(parsed.data.to) : normalizeDate(parsed.data.to, "end"));
  }

  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

function addRepeatedFilter(
  clauses: string[],
  params: unknown[],
  column: string,
  values: string[],
): void {
  const filtered = values.filter(Boolean);
  if (filtered.length === 0) {
    return;
  }
  clauses.push(`${column} IN (${filtered.map(() => "?").join(", ")})`);
  params.push(...filtered);
}

function normalizeDate(value: string, boundary: "start" | "end"): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return boundary === "start" ? `${value}T00:00:00.000Z` : `${value}T23:59:59.999Z`;
  }
  return new Date(value).toISOString();
}

function normalizeDay(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  return new Date(value).toISOString().slice(0, 10);
}
