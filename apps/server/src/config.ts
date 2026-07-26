import { z } from "zod";

export interface ServerConfig {
  adminToken: string;
  dashboardToken?: string;
  port: number;
  dbPath: string;
  webDist: string;
}

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const configSchema = z.object({
  ADMIN_TOKEN: z.string().min(1),
  DASHBOARD_TOKEN: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  PORT: z.coerce.number().int().positive().default(8484),
  DB_PATH: z.string().min(1).default("./data/tokenviewer.db"),
  WEB_DIST: z.string().min(1).default("./apps/web/dist"),
});

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.join(".") || "config";
    throw new Error(`missing or invalid server config: ${field} ${issue?.message ?? ""}`.trim());
  }

  return {
    adminToken: parsed.data.ADMIN_TOKEN,
    dashboardToken: parsed.data.DASHBOARD_TOKEN,
    port: parsed.data.PORT,
    dbPath: parsed.data.DB_PATH,
    webDist: parsed.data.WEB_DIST,
  };
}
