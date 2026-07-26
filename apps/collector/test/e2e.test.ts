import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectorStatePath } from "@tokenviewer/core";
import { saveCollectorConfig } from "../src/config.js";
import { runCollector, statusCollector } from "../src/index.js";

const envBackup = { ...process.env };

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of Object.keys(process.env)) {
    if (!(key in envBackup)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, envBackup);
});

describe.sequential("collector dry-run", () => {
  it.sequential("runs twice without reparsing confirmed files and does not write agent dirs", async () => {
    const root = await mkdtemp(join(tmpdir(), "tv-e2e-"));
    process.env.CLAUDE_CONFIG_DIR = join(root, "claude");
    process.env.XDG_STATE_HOME = join(root, "state");
    process.env.XDG_CONFIG_HOME = join(root, "config");

    const projectDir = join(process.env.CLAUDE_CONFIG_DIR, "projects", "project-a");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(projectDir, { recursive: true }));
    const sourceFile = join(projectDir, "session.jsonl");
    await writeFile(
      sourceFile,
      `${JSON.stringify({
        type: "assistant",
        requestId: "req-1",
        timestamp: "2026-07-05T10:00:00.000Z",
        message: {
          id: "msg-1",
          role: "assistant",
          model: "claude-sonnet-4",
          usage: { input_tokens: 3, output_tokens: 4 },
        },
      })}\n`,
      "utf-8",
    );
    const before = await stat(sourceFile);

    const first = await runCollector({ dryRun: true, agents: ["claude"] });
    expect(first.totals.records).toBe(1);
    expect(first.agents.claude?.filesScanned).toBe(1);

    const second = await runCollector({ dryRun: true, agents: ["claude"] });
    expect(second.totals.records).toBe(0);
    expect(second.agents.claude?.filesOmitted).toBe(1);

    const after = await stat(sourceFile);
    expect(after.mtimeMs).toBe(before.mtimeMs);

    const state = JSON.parse(await readFile(collectorStatePath(), "utf-8")) as {
      files: Record<string, unknown>;
      lastRunAt?: string;
    };
    expect(Object.keys(state.files)).toEqual([sourceFile]);
    expect(state.lastRunAt).toBeTruthy();

    const status = await statusCollector();
    expect(status.cursorFiles).toBe(1);
    expect(status.lastRunAt).toBeTruthy();
  });

  it.sequential("exports the same summary to --out", async () => {
    const root = await mkdtemp(join(tmpdir(), "tv-out-"));
    process.env.CLAUDE_CONFIG_DIR = join(root, "claude");
    process.env.XDG_STATE_HOME = join(root, "state");
    process.env.XDG_CONFIG_HOME = join(root, "config");
    const out = join(root, "summary.json");

    const summary = await runCollector({ dryRun: true, agents: ["claude"], out });
    expect(JSON.parse(await readFile(out, "utf-8"))).toEqual(summary);
  });

  it.sequential("fails non-dry-run without config before touching cursors", async () => {
    const root = await mkdtemp(join(tmpdir(), "tv-fail-"));
    process.env.XDG_STATE_HOME = join(root, "state");

    await expect(runCollector({ dryRun: false, agents: ["claude"] })).rejects.toThrow(
      "serverUrl y machineToken son obligatorios",
    );
    await expect(readFile(collectorStatePath(), "utf-8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.sequential("collects Copilot quota once during a configured server run", async () => {
    const root = await mkdtemp(join(tmpdir(), "tv-copilot-run-"));
    process.env.CLAUDE_CONFIG_DIR = join(root, "claude");
    process.env.XDG_STATE_HOME = join(root, "state");
    process.env.XDG_CONFIG_HOME = join(root, "config");
    await saveCollectorConfig({
      serverUrl: "http://server.local",
      machineToken: "tv_machine",
      copilotToken: "gho_secret",
      machineName: "machine",
    });

    const quotaBodies: string[] = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      if (target.endsWith("/api/v1/ingest")) {
        return Response.json({ accepted: 0, duplicates: 0 });
      }
      if (target === "https://api.github.com/copilot_internal/user") {
        return Response.json({
          login: "octocat",
          plan: "Pro",
          quota_snapshots: { premium_interactions: { percent_used: 51 } },
        });
      }
      if (target.endsWith("/api/v1/ingest-quota")) {
        quotaBodies.push(String(init?.body));
        return Response.json({ accepted: true });
      }
      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const summary = await runCollector({ dryRun: false, agents: ["claude"] });

    expect((summary as typeof summary & { quota?: { accepted: boolean } }).quota).toEqual({ accepted: true });
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "https://api.github.com/copilot_internal/user")).toHaveLength(1);
    expect(quotaBodies).toHaveLength(1);
    expect(quotaBodies[0]).toContain("octocat");
    expect(quotaBodies[0]).not.toContain("gho_secret");
  });
});
