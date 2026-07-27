import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectorStatePath, configFilePath } from "@tokenviewer/core";
import { loadCollectorConfig, saveCollectorConfig } from "../src/config.js";
import { loadCollectorState, saveCollectorState } from "../src/state.js";

const envBackup = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in envBackup)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, envBackup);
});

describe.sequential("collector state", () => {
  it.sequential("saves atomically formatted schema-versioned state", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tv-state-"));
    process.env.XDG_STATE_HOME = dir;
    await saveCollectorState({
      schemaVersion: 1,
      files: { "/tmp/a.jsonl": { size: 10, mtimeMs: 20, lastByteOffset: 10 } },
      lastRunAt: "2026-07-05T10:00:00.000Z",
    });

    const raw = await readFile(collectorStatePath(), "utf-8");
    expect(JSON.parse(raw)).toMatchObject({
      schemaVersion: 1,
      files: { "/tmp/a.jsonl": { size: 10, mtimeMs: 20, lastByteOffset: 10 } },
    });
  });

  it.sequential("discards corrupt state with a warning", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tv-state-"));
    process.env.XDG_STATE_HOME = dir;
    const path = collectorStatePath();
    await import("node:fs/promises").then(({ mkdir }) =>
      mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true }),
    );
    await writeFile(path, "{not-json", "utf-8");

    const result = await loadCollectorState();
    expect(result.state).toEqual({ schemaVersion: 1, files: {} });
    expect(result.warning).toContain("corrupto");
  });
});

describe.sequential("collector config", () => {
  it.sequential("persists Copilot token with 0600 permissions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tv-config-"));
    process.env.XDG_CONFIG_HOME = dir;

    await saveCollectorConfig({
      copilotToken: "gho_secret",
      machineName: "angel-mac",
      checkoutPath: dir,
      agents: ["claude"],
    });

    expect(await loadCollectorConfig()).toMatchObject({
      copilotToken: "gho_secret",
      machineName: "angel-mac",
      checkoutPath: dir,
      agents: ["claude"],
    });
    expect((await stat(configFilePath())).mode & 0o777).toBe(0o600);
  });

  it.sequential("rejects legacy server credentials and unapproved identities", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tv-config-"));
    process.env.XDG_CONFIG_HOME = dir;
    const path = configFilePath();
    await import("node:fs/promises").then(({ mkdir }) => mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true }));
    await writeFile(
      path,
      JSON.stringify({
        machineName: "other-machine",
        checkoutPath: dir,
        serverUrl: "https://server.local",
        machineToken: "secret",
      }),
      "utf8",
    );

    await expect(loadCollectorConfig()).rejects.toThrow(/machineName|Unrecognized key/);
  });
});
