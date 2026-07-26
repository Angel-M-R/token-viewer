import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import type { AppContext } from "./app.js";

export interface MachineIdentity {
  id: number;
  name: string;
}

export function generateMachineToken(): string {
  return `tv_${randomBytes(32).toString("hex")}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function bearerToken(c: Context): string | null {
  const header = c.req.header("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export function requireAdmin(c: Context, context: AppContext): Response | null {
  const token = bearerToken(c);
  if (!token || !safeEqual(token, context.config.adminToken)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return null;
}

export function requireDashboard(c: Context, context: AppContext): Response | null {
  if (!context.config.dashboardToken) {
    return null;
  }
  const token = bearerToken(c);
  if (!token || !matchesDashboardToken(token, context)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return null;
}

export function requireAdminOrDashboard(c: Context, context: AppContext): Response | null {
  if (!context.config.dashboardToken) {
    return null;
  }
  const token = bearerToken(c);
  if (!token) {
    return c.json({ error: "unauthorized" }, 401);
  }
  if (safeEqual(token, context.config.adminToken) || matchesDashboardToken(token, context)) {
    return null;
  }
  return c.json({ error: "unauthorized" }, 401);
}

export function resolveMachine(c: Context, context: AppContext): MachineIdentity | Response {
  const token = bearerToken(c);
  if (!token) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const tokenHash = hashToken(token);
  const rows = context.db.sqlite.prepare("SELECT id, name, token_hash FROM machines").all() as {
    id: number;
    name: string;
    token_hash: string;
  }[];

  for (const row of rows) {
    if (safeEqual(row.token_hash, tokenHash)) {
      return { id: row.id, name: row.name };
    }
  }

  return c.json({ error: "unauthorized" }, 401);
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    timingSafeEqual(leftBuffer, leftBuffer);
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function matchesDashboardToken(token: string, context: AppContext): boolean {
  return context.config.dashboardToken ? safeEqual(token, context.config.dashboardToken) : true;
}
