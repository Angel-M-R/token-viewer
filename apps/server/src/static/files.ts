import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import type { Hono } from "hono";
import type { AppContext } from "../app.js";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export function registerStaticRoutes(app: Hono, context: AppContext): void {
  app.get("*", async (c) => {
    const url = new URL(c.req.url);
    if (url.pathname.startsWith("/api/") || url.pathname === "/health") {
      return c.json({ error: "not found" }, 404);
    }

    if (!existsSync(context.config.webDist)) {
      return c.text("dashboard build not found; API is available under /api/v1", 404);
    }

    const requested = safeStaticPath(context.config.webDist, url.pathname);
    const file = await readableFile(requested)
      .catch(() => null)
      .then((path) => path ?? readableFile(join(context.config.webDist, "index.html")).catch(() => null));

    if (!file) {
      return c.text("dashboard index.html not found", 404);
    }

    const body = await readFile(file);
    return new Response(body, {
      headers: {
        "content-type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
      },
    });
  });
}

function safeStaticPath(root: string, pathname: string): string {
  const normalized = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
  const clean = normalized === "/" ? "/index.html" : normalized;
  return join(root, clean);
}

async function readableFile(path: string): Promise<string | null> {
  const fileStat = await stat(path);
  return fileStat.isFile() ? path : null;
}
