import { Hono } from "hono";
import type { ServerConfig } from "./config.js";
import type { DbClient } from "./db/client.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerIngestRoutes } from "./routes/ingest.js";
import { registerMachineRoutes } from "./routes/machines.js";
import { registerRecordsRoutes } from "./routes/records.js";
import { registerQuotaRoutes } from "./routes/quota.js";
import { registerStatsRoutes } from "./routes/stats.js";
import { registerStaticRoutes } from "./static/files.js";

export interface AppContext {
  db: DbClient;
  config: ServerConfig;
}

export function createApp(context: AppContext): Hono {
  const app = new Hono();

  app.get("/health", (c) => {
    context.db.sqlite.prepare("SELECT 1").get();
    return c.json({ ok: true });
  });

  registerMachineRoutes(app, context);
  registerIngestRoutes(app, context);
  registerAdminRoutes(app, context);
  registerStatsRoutes(app, context);
  registerRecordsRoutes(app, context);
  registerQuotaRoutes(app, context);
  registerStaticRoutes(app, context);

  return app;
}
