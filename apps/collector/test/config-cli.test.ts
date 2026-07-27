import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadCollectorConfig, saveCollectorConfig } from "../src/config.js";

const envBackup = { ...process.env };
const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in envBackup)) delete process.env[key];
  }
  Object.assign(process.env, envBackup);
});

describe.sequential("collector active identity configuration", () => {
  it.each(["angel-mac", "aon-mac-m5"] as const)(
    "retains operational settings for active publisher %s",
    async (machineName) => {
      const root = await temporaryRoot("tv-config-active-");
      const checkoutPath = join(root, "operational-checkout");

      await saveCollectorConfig({
        machineName,
        checkoutPath,
        expectedRemoteUrl: "git@github.com:owner/tokenViewer.git",
        agents: ["claude", "codex"],
      });

      await expect(loadCollectorConfig()).resolves.toEqual({
        machineName,
        checkoutPath,
        expectedRemoteUrl: "git@github.com:owner/tokenViewer.git",
        agents: ["claude", "codex"],
      });
      const persisted = await readFile(configPath(root), "utf8");
      expect(persisted).not.toMatch(/gitToken|gitPassword|gitCredentials/);
    },
  );

  it("rejects retired identities and embedded Git credentials", async () => {
    const root = await temporaryRoot("tv-config-invalid-");

    await expect(
      saveCollectorConfig({
        machineName: "aon-mac",
        checkoutPath: root,
      } as never),
    ).rejects.toThrow(/machineName|Invalid option/);
    await expect(
      saveCollectorConfig({
        machineName: "angel-mac",
        checkoutPath: root,
        expectedRemoteUrl: "https://user:secret@example.com/tokenViewer.git",
      }),
    ).rejects.toThrow(/embedded Git credentials/);
    await expect(stat(configPath(root))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("fails an operational CLI run for aon-mac before scanning, writing, or Git", async () => {
    const root = await temporaryRoot("tv-cli-retired-");
    const checkoutPath = join(root, "checkout");
    const gitMarker = join(root, "git-invoked");
    const binPath = join(root, "bin");
    await mkdir(binPath, { recursive: true });
    await writeFile(
      join(binPath, "git"),
      `#!/bin/sh\ntouch ${JSON.stringify(gitMarker)}\nexit 99\n`,
      { encoding: "utf8", mode: 0o755 },
    );
    await mkdir(dirname(configPath(root)), { recursive: true });
    await writeFile(
      configPath(root),
      `${JSON.stringify({
        machineName: "aon-mac",
        checkoutPath,
        expectedRemoteUrl: "git@github.com:owner/tokenViewer.git",
        agents: ["claude"],
        copilotToken: "copilot-token-must-remain-unused",
      })}\n`,
      "utf8",
    );

    const result = await runCli(root, ["run", "--publish", "--out", join(root, "summary.json")], {
      PATH: `${binPath}:${process.env.PATH ?? ""}`,
      CLAUDE_CONFIG_DIR: join(root, "source-canary"),
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/machineName|Invalid option/);
    await expect(stat(join(root, "summary.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(join(checkoutPath, "snapshots"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(join(root, "state", "tokenviewer", "collector-state.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(gitMarker)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

async function temporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  process.env.XDG_CONFIG_HOME = join(root, "config");
  process.env.XDG_STATE_HOME = join(root, "state");
  return root;
}

function configPath(root: string): string {
  return join(root, "config", "tokenviewer", "config.json");
}

async function runCli(
  root: string,
  args: string[],
  env: NodeJS.ProcessEnv = {},
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--conditions", "development", "--import", "tsx", cliPath, ...args],
      {
      env: {
        ...process.env,
        ...env,
        XDG_CONFIG_HOME: join(root, "config"),
        XDG_STATE_HOME: join(root, "state"),
      },
      stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}
