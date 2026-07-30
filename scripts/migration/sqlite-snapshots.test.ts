import { DatabaseSync } from "node:sqlite";
import { mkdtemp, mkdir, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeDailySnapshotAtomic } from "../../packages/core/src/snapshot-generation.js";
import { validateSnapshotDirectory } from "../../packages/core/src/snapshot-files.js";
import {
  createEquivalenceReport,
  importLegacySnapshots,
  LegacyMigrationError,
} from "./sqlite-snapshots.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("one-time SQLite snapshot migration", () => {
  it.each(["angel-mac", "old-mac"] as const)("imports %s independently without private source fields", async (machine) => {
    const fixture = await createFixture();
    addUsage(fixture.databasePath, machine, { hash: `${machine}-one`, date: "2025-09-16" });

    const result = await importLegacySnapshots({
      databasePath: fixture.databasePath,
      repositoryRoot: fixture.repositoryRoot,
      machine,
      generatedAt: new Date("2026-07-27T10:00:00.000Z"),
    });

    expect(result.importedDates).toEqual(["2025-09-16"]);
    const files = await validateSnapshotDirectory(join(fixture.repositoryRoot, "snapshots"));
    expect(files.map((file) => file.machine)).toEqual([machine]);
    expect(files[0]?.snapshot.totals).toMatchObject({ requests: 1, inputTokens: 10, billedCost: 0.02 });
    const serialized = await readFile(snapshotPath(fixture.repositoryRoot, machine, "2025-09-16"), "utf8");
    expect(serialized).not.toMatch(/private-session|private-project|private-hash|secret-login|raw-payload/);
  });

  it("fills SQLite-only historical days without replacing an existing local day", async () => {
    const fixture = await createFixture();
    addUsage(fixture.databasePath, "angel-mac", { hash: "older", date: "2025-09-11" });
    addUsage(fixture.databasePath, "angel-mac", { hash: "existing", date: "2025-09-12" });
    await writeDailySnapshotAtomic(fixture.repositoryRoot, emptySnapshot("angel-mac", "2025-09-12"));
    const before = await readFile(snapshotPath(fixture.repositoryRoot, "angel-mac", "2025-09-12"), "utf8");

    const result = await importLegacySnapshots({
      databasePath: fixture.databasePath,
      repositoryRoot: fixture.repositoryRoot,
      machine: "angel-mac",
      generatedAt: new Date("2026-07-27T10:00:00.000Z"),
    });

    expect(result.importedDates).toEqual(["2025-09-11"]);
    expect(result.existingDates).toEqual(["2025-09-12"]);
    expect(await readFile(snapshotPath(fixture.repositoryRoot, "angel-mac", "2025-09-12"), "utf8")).toBe(before);
  });

  it("keeps imported historical old-mac snapshots byte-for-byte immutable", async () => {
    const fixture = await createFixture();
    addUsage(fixture.databasePath, "old-mac", { hash: "historical", date: "2025-09-12" });
    await writeDailySnapshotAtomic(fixture.repositoryRoot, emptySnapshot("old-mac", "2025-09-12"));
    const path = snapshotPath(fixture.repositoryRoot, "old-mac", "2025-09-12");
    const before = await readFile(path);

    const result = await importLegacySnapshots({
      databasePath: fixture.databasePath,
      repositoryRoot: fixture.repositoryRoot,
      machine: "old-mac",
    });

    expect(result.importedDates).toEqual([]);
    expect(result.existingDates).toEqual(["2025-09-12"]);
    expect(await readFile(path)).toEqual(before);
  });

  it("never assigns retired old-mac SQLite history to mac-m5", async () => {
    const fixture = await createFixture();
    addUsage(fixture.databasePath, "old-mac", { hash: "retired", date: "2025-09-12" });

    await expect(importLegacySnapshots({
      databasePath: fixture.databasePath,
      repositoryRoot: fixture.repositoryRoot,
      machine: "mac-m5",
    })).rejects.toThrow(/no legacy SQLite history/);
    await expect(createEquivalenceReport({
      databasePath: fixture.databasePath,
      repositoryRoot: fixture.repositoryRoot,
      machines: ["mac-m5"],
    })).rejects.toThrow(/no legacy SQLite history/);
    expect(await validateSnapshotDirectory(join(fixture.repositoryRoot, "snapshots"))).toEqual([]);
  });

  it("deduplicates source records inside SQLite without persisting their hashes", async () => {
    const fixture = await createFixture();
    addUsage(fixture.databasePath, "old-mac", { hash: "duplicate", date: "2025-09-16" });
    addUsage(fixture.databasePath, "old-mac", { hash: "duplicate", date: "2025-09-16" });

    const result = await importLegacySnapshots({
      databasePath: fixture.databasePath,
      repositoryRoot: fixture.repositoryRoot,
      machine: "old-mac",
    });
    const files = await validateSnapshotDirectory(join(fixture.repositoryRoot, "snapshots"));

    expect(result.duplicateUsageRecords).toBe(1);
    expect(files[0]?.snapshot.totals?.requests).toBe(1);
    expect(JSON.stringify(files[0]?.snapshot)).not.toContain("duplicate");
  });

  it("rejects malformed legacy rows without writing partial snapshots", async () => {
    const fixture = await createFixture();
    addUsage(fixture.databasePath, "angel-mac", { hash: "malformed", date: "2025-09-11", inputTokens: -1 });

    await expect(importLegacySnapshots({
      databasePath: fixture.databasePath,
      repositoryRoot: fixture.repositoryRoot,
      machine: "angel-mac",
    })).rejects.toThrow(LegacyMigrationError);
    expect(await validateSnapshotDirectory(join(fixture.repositoryRoot, "snapshots"))).toEqual([]);
  });

  it("rejects a symlinked selected-machine folder and never writes outside its ownership boundary", async () => {
    const fixture = await createFixture();
    addUsage(fixture.databasePath, "angel-mac", { hash: "owned", date: "2025-09-11" });
    const outside = join(fixture.root, "outside");
    await mkdir(outside);
    await mkdir(join(fixture.repositoryRoot, "snapshots"));
    await symlink(outside, join(fixture.repositoryRoot, "snapshots", "angel-mac"));

    await expect(importLegacySnapshots({
      databasePath: fixture.databasePath,
      repositoryRoot: fixture.repositoryRoot,
      machine: "angel-mac",
    })).rejects.toThrow(/symbolic link/);
    expect(await validateSnapshotDirectory(outside)).toEqual([]);
  });

  it("compares strict metrics in overlap and classifies newer snapshot metrics as expected additions", async () => {
    const fixture = await createFixture();
    addUsage(fixture.databasePath, "angel-mac", { hash: "private-hash", date: "2025-09-11" });
    await importLegacySnapshots({
      databasePath: fixture.databasePath,
      repositoryRoot: fixture.repositoryRoot,
      machine: "angel-mac",
      generatedAt: new Date("2026-07-27T10:00:00.000Z"),
    });

    const equivalent = await createEquivalenceReport({
      databasePath: fixture.databasePath,
      repositoryRoot: fixture.repositoryRoot,
      machines: ["angel-mac"],
      generatedAt: new Date("2026-07-27T10:01:00.000Z"),
    });
    expect(equivalent.differences).toEqual([]);
    expect(equivalent.expectedAdditions).toEqual([]);
    expect(equivalent.report).toContain("Status: PASS");
    expect(equivalent.report).not.toMatch(/private-hash|private-session|private-project|secret-login|raw-payload/);

    await writeDailySnapshotAtomic(fixture.repositoryRoot, {
      ...emptySnapshot("angel-mac", "2025-09-12"),
      usage: [{
        agent: "codex",
        provider: "openai",
        model: "gpt-test",
        requests: 1,
        inputTokens: 10,
        outputTokens: 5,
        reasoningTokens: 1,
        cacheReadTokens: 2,
        cacheWriteTokens: 3,
        estimatedCost: 0.01,
        billedCost: 0.02,
        unpricedRequests: 0,
      }],
      totals: {
        requests: 1,
        inputTokens: 10,
        outputTokens: 5,
        reasoningTokens: 1,
        cacheReadTokens: 2,
        cacheWriteTokens: 3,
        estimatedCost: 0.01,
        billedCost: 0.02,
        unpricedRequests: 0,
      },
    });
    const additions = await createEquivalenceReport({
      databasePath: fixture.databasePath,
      repositoryRoot: fixture.repositoryRoot,
      machines: ["angel-mac"],
    });
    expect(additions.differences).toEqual([]);
    expect(additions.expectedAdditions).toHaveLength(8);
    expect(new Set(additions.expectedAdditions.map((addition) => addition.date))).toEqual(new Set(["2025-09-12"]));
    expect(additions.report).toContain("Status: PASS");
    expect(additions.report).toContain("Expected snapshot-only addition outside legacy coverage.");

    await writeDailySnapshotAtomic(fixture.repositoryRoot, emptySnapshot("angel-mac", "2025-09-11"));
    const different = await createEquivalenceReport({
      databasePath: fixture.databasePath,
      repositoryRoot: fixture.repositoryRoot,
      machines: ["angel-mac"],
    });
    expect(different.differences.some((difference) => difference.metric === "requests")).toBe(true);
    expect(different.report).toContain("Status: BLOCKED");
    expect(different.report).toContain("Unresolved overlap mismatch; review required.");
    expect(different.expectedAdditions).toHaveLength(8);
  });

  it("keeps quota mismatches inside overlap blocking", async () => {
    const fixture = await createFixture();
    addUsage(fixture.databasePath, "angel-mac", { hash: "coverage", date: "2025-09-11" });
    addQuota(fixture.databasePath, "angel-mac", "2025-09-11", 40);
    await importLegacySnapshots({
      databasePath: fixture.databasePath,
      repositoryRoot: fixture.repositoryRoot,
      machine: "angel-mac",
    });
    await writeDailySnapshotAtomic(fixture.repositoryRoot, {
      ...emptySnapshot("angel-mac", "2025-09-11"),
      quotaSamples: [{
        provider: "copilot",
        takenAt: "2025-09-11",
        percentUsed: 41,
        plan: "individual",
        resetsAt: "2025-10-01T00:00:00.000Z",
      }],
    });

    const result = await createEquivalenceReport({
      databasePath: fixture.databasePath,
      repositoryRoot: fixture.repositoryRoot,
      machines: ["angel-mac"],
    });
    expect(result.differences.some((difference) =>
      difference.scope === "quota" && difference.metric === "percentUsed"
    )).toBe(true);
    expect(result.expectedAdditions).toEqual([]);
  });
});

async function createFixture(): Promise<{ root: string; repositoryRoot: string; databasePath: string }> {
  const root = await mkdtemp(join(tmpdir(), "tokenviewer-migration-"));
  roots.push(root);
  const repositoryRoot = join(root, "repository");
  const databasePath = join(root, "legacy.sqlite");
  await mkdir(repositoryRoot);
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE machines (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE usage_records (
      id INTEGER PRIMARY KEY,
      machine_id INTEGER NOT NULL,
      record_hash TEXT NOT NULL,
      agent TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      ts TEXT NOT NULL,
      session TEXT,
      project TEXT,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      reasoning_tokens INTEGER NOT NULL,
      cache_read_tokens INTEGER NOT NULL,
      cache_write_tokens INTEGER NOT NULL,
      cost_usd REAL,
      billed_cost_usd REAL,
      pricing_source TEXT
    );
    CREATE TABLE quota_snapshots (
      id INTEGER PRIMARY KEY,
      machine_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      taken_at TEXT NOT NULL,
      percent_used REAL,
      plan TEXT,
      resets_at TEXT,
      raw TEXT NOT NULL
    );
    INSERT INTO machines (id, name) VALUES (1, 'angel-mac'), (2, 'old-mac');
  `);
  database.close();
  return { root, repositoryRoot, databasePath };
}

function addUsage(
  databasePath: string,
  machine: "angel-mac" | "old-mac",
  options: { hash: string; date: string; inputTokens?: number },
): void {
  const database = new DatabaseSync(databasePath);
  database.prepare(`
    INSERT INTO usage_records (
      machine_id, record_hash, agent, provider, model, ts, session, project,
      input_tokens, output_tokens, reasoning_tokens, cache_read_tokens, cache_write_tokens,
      cost_usd, billed_cost_usd, pricing_source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    machine === "angel-mac" ? 1 : 2,
    options.hash,
    "codex",
    "openai",
    "gpt-test",
    `${options.date}T10:15:00.000Z`,
    "private-session",
    "private-project",
    options.inputTokens ?? 10,
    5,
    1,
    2,
    3,
    0.01,
    0.02,
    "catalog",
  );
  database.close();
}

function addQuota(databasePath: string, machine: "angel-mac" | "old-mac", date: string, percentUsed: number): void {
  const database = new DatabaseSync(databasePath);
  database.prepare(`
    INSERT INTO quota_snapshots (
      machine_id, provider, taken_at, percent_used, plan, resets_at, raw
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    machine === "angel-mac" ? 1 : 2,
    "copilot",
    `${date}T12:00:00.000Z`,
    percentUsed,
    "individual",
    "2025-10-01T00:00:00.000Z",
    "raw-payload",
  );
  database.close();
}

function emptySnapshot(machine: "angel-mac" | "old-mac", date: string) {
  return {
    schemaVersion: 2 as const,
    machine,
    date,
    generatedAt: "2026-07-27T10:00:00.000Z",
    usage: [],
    quotaSamples: [],
    totals: {
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      estimatedCost: 0,
      billedCost: 0,
      unpricedRequests: 0,
    },
  };
}

function snapshotPath(repositoryRoot: string, machine: string, date: string): string {
  return join(repositoryRoot, "snapshots", machine, date.slice(0, 4), date.slice(5, 7), `${date}.json`);
}
