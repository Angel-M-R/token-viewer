import type { Hono } from "hono";
import type { AppContext } from "../app.js";
import { requireAdmin } from "../auth.js";
import { repriceAll } from "../pricing/index.js";

export function registerAdminRoutes(app: Hono, context: AppContext): void {
  app.post("/api/v1/admin/reprice", async (c) => {
    const unauthorized = requireAdmin(c, context);
    if (unauthorized) {
      return unauthorized;
    }

    const updated = await repriceAll(context.db);
    return c.json({ updated });
  });
}
