import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectorStatePath, validateSnapshotSet, type PricingCatalog } from "@tokenviewer/core";
import { saveCollectorConfig } from "../src/config.js";
import { runCollector, statusCollector } from "../src/index.js";
import { saveCollectorState } from "../src/state.js";

const envBackup = { ...process.env };
const PRICING: PricingCatalog = { source: "fallback" };
const NOW = new Date("2026-07-05T12:00:00.000Z");

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of Object.keys(process.env)) {
    if (!(key in envBackup)) delete process.env[key];
  }
  Object.assign(process.env, envBackup);
});

describe.sequential("collector local snapshots", () => {
  it.sequential("previews aggregate days without snapshots, state, Git, endpoints, or private records", async () => {
    const root = await collectorRoot("tv-dry-");
    const sourceFile = await writeClaudeRecord(root);
    const fetcher = vi.fn();

    const summary = await runCollector(
      { dryRun: true, agents: ["claude"] },
      { pricing: PRICING, now: () => NOW, fetcher },
    );

    expect(summary.sourceCoverage.dates).toEqual(["2026-07-05"]);
    expect(summary.days).toMatchObject([{ date: "2026-07-05", rows: 1, requests: 1 }]);
    expect(summary.totals).toMatchObject({ requests: 1, inputTokens: 3, outputTokens: 4 });
    expect(JSON.stringify(summary)).not.toContain(sourceFile);
    expect(JSON.stringify(summary)).not.toMatch(/req-1|msg-1|recordHash|session|project/);
    await expect(stat(join(root, "snapshots"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(collectorStatePath(), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.sequential("writes validated aggregates with one best-effort sanitized quota sample", async () => {
    const root = await collectorRoot("tv-write-", "gho_secret");
    await writeClaudeRecord(root);
    const fetcher = vi.fn(async () =>
      Response.json({
        login: "octocat",
        plan: "Pro",
        resets_at: "2026-08-01T00:00:00Z",
        quota_snapshots: { premium_requests: { percent_used: 51 } },
        unknown: "discarded",
      }),
    );

    const summary = await runCollector(
      { dryRun: false, agents: ["claude"] },
      { pricing: PRICING, now: () => NOW, fetcher },
    );
    const relativePath = "snapshots/angel-mac/2026/07/2026-07-05.json";
    const snapshot = JSON.parse(await readFile(join(root, relativePath), "utf8")) as unknown;

    expect(summary.writtenDates).toEqual(["2026-07-05"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(validateSnapshotSet([{ path: relativePath, value: snapshot }])[0]?.snapshot.quotaSamples).toEqual([
      {
        provider: "copilot",
        takenAt: "2026-07-05",
        percentUsed: 51,
        plan: "Pro",
        resetsAt: "2026-08-01T00:00:00.000Z",
      },
    ]);
    expect(JSON.stringify(snapshot)).not.toMatch(/octocat|unknown|gho_secret|raw|login/);
  });

  it.sequential("rejects versioned state and completely rescans without converting or deleting it", async () => {
    const root = await collectorRoot("tv-versioned-state-");
    const sourceFile = await writeClaudeRecord(root);
    const sourceStat = await stat(sourceFile);
    const path = collectorStatePath();
    await import("node:fs/promises").then(({ mkdir }) =>
      mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true }),
    );
    const versionedState = `${JSON.stringify({
      schemaVersion: 1,
      files: {
        [sourceFile]: {
          size: sourceStat.size,
          mtimeMs: sourceStat.mtimeMs,
          lastByteOffset: sourceStat.size,
        },
      },
      lastRunAt: "2026-07-05T11:00:00.000Z",
    })}\n`;
    await writeFile(path, versionedState, "utf8");

    const summary = await runCollector(
      { dryRun: true, agents: ["claude"] },
      { pricing: PRICING, now: () => NOW },
    );

    expect(summary.warnings).toEqual([expect.stringContaining("version desconocida")]);
    expect(summary.totals).toMatchObject({ requests: 1, inputTokens: 3, outputTokens: 4 });
    await expect(readFile(path, "utf8")).resolves.toBe(versionedState);
  });

  it.sequential("reports identity, source and snapshot coverage, missing days, last run, and pending commit", async () => {
    const root = await collectorRoot("tv-status-");
    await writeClaudeRecord(root);
    await saveCollectorState({
      files: {},
      lastRunAt: "2026-07-06T00:00:00.000Z",
      pendingPublicationCommit: "abc1234",
    });

    const status = await statusCollector();

    expect(status).toMatchObject({
      identity: "angel-mac",
      sourceCoverage: { dates: ["2026-07-05"], from: "2026-07-05", to: "2026-07-05" },
      snapshotCoverage: { dates: [] },
      missingDays: ["2026-07-05"],
      lastRunAt: "2026-07-06T00:00:00.000Z",
      pendingPublicationCommit: "abc1234",
    });
    expect(JSON.stringify(status)).not.toMatch(/gho_|sourceFile|recordHash/);
  });

  it.sequential("repairs yesterday after the day closes", async () => {
    const root = await collectorRoot("tv-repair-yesterday-");
    await writeClaudeRecords(root, [claudeRecord("req-1", "2026-07-04T06:00:00.000Z", 3)]);

    await runCollector(
      { dryRun: false, agents: ["claude"] },
      { pricing: PRICING, now: () => new Date("2026-07-04T07:00:00.000Z") },
    );

    await writeClaudeRecords(root, [
      claudeRecord("req-1", "2026-07-04T06:00:00.000Z", 3),
      claudeRecord("req-2", "2026-07-04T18:00:00.000Z", 7),
    ]);
    const summary = await runCollector(
      { dryRun: false, agents: ["claude"] },
      { pricing: PRICING, now: () => NOW },
    );

    expect(summary.writtenDates).toContain("2026-07-04");
    expect(await snapshotInputTokens(root, "2026-07-04")).toBe(10);
  });

  it.sequential("repairs every historical source date only when requested", async () => {
    const root = await collectorRoot("tv-repair-all-");
    await writeClaudeRecords(root, [claudeRecord("req-1", "2026-07-03T06:00:00.000Z", 3)]);

    await runCollector(
      { dryRun: false, agents: ["claude"] },
      { pricing: PRICING, now: () => new Date("2026-07-03T07:00:00.000Z") },
    );

    await writeClaudeRecords(root, [
      claudeRecord("req-1", "2026-07-03T06:00:00.000Z", 3),
      claudeRecord("req-2", "2026-07-03T18:00:00.000Z", 7),
    ]);
    const summary = await runCollector(
      { dryRun: false, repairAll: true, agents: ["claude"] },
      { pricing: PRICING, now: () => NOW },
    );

    expect(summary.writtenDates).toContain("2026-07-03");
    expect(await snapshotInputTokens(root, "2026-07-03")).toBe(10);
  });
});

async function collectorRoot(prefix: string, copilotToken?: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  process.env.CLAUDE_CONFIG_DIR = join(root, "claude");
  process.env.XDG_STATE_HOME = join(root, "state");
  process.env.XDG_CONFIG_HOME = join(root, "config");
  await saveCollectorConfig({
    machineName: "angel-mac",
    checkoutPath: root,
    agents: ["claude"],
    copilotToken,
  });
  return root;
}

async function writeClaudeRecord(root: string): Promise<string> {
  return writeClaudeRecords(root, [claudeRecord("req-1", "2026-07-05T10:00:00.000Z", 3)]);
}

function claudeRecord(requestId: string, timestamp: string, inputTokens: number): object {
  return {
    type: "assistant",
    requestId,
    timestamp,
    message: {
      id: `msg-${requestId}`,
      role: "assistant",
      model: "claude-sonnet-4",
      usage: { input_tokens: inputTokens, output_tokens: 4 },
    },
  };
}

async function writeClaudeRecords(root: string, records: object[]): Promise<string> {
  const projectDir = join(root, "claude", "projects", "project-a");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(projectDir, { recursive: true }));
  const sourceFile = join(projectDir, "session.jsonl");
  await writeFile(
    sourceFile,
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf8",
  );
  return sourceFile;
}

async function snapshotInputTokens(root: string, date: string): Promise<number> {
  const snapshot = JSON.parse(
    await readFile(
      join(root, "snapshots", "angel-mac", date.slice(0, 4), date.slice(5, 7), `${date}.json`),
      "utf8",
    ),
  ) as { totals: { inputTokens: number } };
  return snapshot.totals.inputTokens;
}
