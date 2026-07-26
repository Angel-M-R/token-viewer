import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadServerConfig } from "./config.js";
import { openDb } from "./db/client.js";

const config = loadServerConfig();
const db = openDb(config.dbPath);
const app = createApp({ config, db });

serve({ fetch: app.fetch, port: config.port }, () => {
  console.log(`tokenviewer server listening on :${config.port}`);
});

process.on("SIGINT", () => {
  db.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  db.close();
  process.exit(0);
});
