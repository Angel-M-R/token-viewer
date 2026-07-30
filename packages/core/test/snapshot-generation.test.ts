import { mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  generateDailySnapshots,
  type PricingCatalog,
  type UsageRecord,
} from "../src/index.js";

const PRICING: PricingCatalog = { source: "fallback" };
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("daily snapshot generation", () => {
  it("performs a deterministic first backfill using only canonical machine paths", async () => {
    const root = await temporaryRoot();
    await writeFile(join(root, "collector-state.json"), "{corrupt", "utf8");
    const records = [record("late", "2026-07-27T18:00:00.000Z"), record("early", "2026-07-25T01:00:00.000Z")];

    const first = await generateDailySnapshots({
      repositoryRoot: root,
      machine: "angel-mac",
      records,
      pricing: PRICING,
      now: new Date("2026-07-27T21:00:00.000Z"),
    });

    expect(first.availableSourceDates).toEqual(["2026-07-25", "2026-07-27"]);
    expect(first.writtenDates).toEqual(["2026-07-25", "2026-07-27"]);
    expect(await snapshotFiles(root)).toEqual([
      "snapshots/angel-mac/2026/07/2026-07-25.json",
      "snapshots/angel-mac/2026/07/2026-07-27.json",
    ]);
    expect(await readFile(join(root, "collector-state.json"), "utf8")).toBe("{corrupt");

    const openPath = join(root, "snapshots/angel-mac/2026/07/2026-07-27.json");
    const firstBytes = await readFile(openPath, "utf8");
    const rerun = await generateDailySnapshots({
      repositoryRoot: root,
      machine: "angel-mac",
      records,
      pricing: PRICING,
      now: new Date("2026-07-27T21:30:00.000Z"),
    });
    expect(rerun).toMatchObject({
      writtenDates: [],
      unchangedDates: ["2026-07-27"],
      protectedClosedDates: ["2026-07-25"],
    });
    expect(await readFile(openPath, "utf8")).toBe(firstBytes);

    await unlink(join(root, "collector-state.json"));
    const withoutState = await generateDailySnapshots({
      repositoryRoot: root,
      machine: "angel-mac",
      records,
      pricing: PRICING,
      now: new Date("2026-07-27T21:45:00.000Z"),
    });
    expect(withoutState.writtenDates).toEqual([]);
  });

  it("reconstructs a gap without rewriting surrounding closed days", async () => {
    const root = await temporaryRoot();
    await generateDailySnapshots({
      repositoryRoot: root,
      machine: "old-mac",
      records: [record("one", "2026-07-25T01:00:00.000Z"), record("three", "2026-07-27T01:00:00.000Z")],
      pricing: PRICING,
      now: new Date("2026-07-28T12:00:00.000Z"),
    });

    const result = await generateDailySnapshots({
      repositoryRoot: root,
      machine: "old-mac",
      records: [
        record("one", "2026-07-25T01:00:00.000Z"),
        record("two", "2026-07-26T01:00:00.000Z"),
        record("three", "2026-07-27T01:00:00.000Z"),
      ],
      pricing: PRICING,
      now: new Date("2026-07-28T13:00:00.000Z"),
    });

    expect(result.writtenDates).toEqual(["2026-07-26"]);
    expect(result.protectedClosedDates).toEqual(["2026-07-25", "2026-07-27"]);
  });

  it("regenerates the open Europe/Madrid day while protecting closed days", async () => {
    const root = await temporaryRoot();
    const initial = [record("closed", "2026-07-26T10:00:00.000Z"), record("open", "2026-07-27T10:00:00.000Z")];
    await generateDailySnapshots({
      repositoryRoot: root,
      machine: "angel-mac",
      records: initial,
      pricing: PRICING,
      now: new Date("2026-07-27T12:00:00.000Z"),
    });

    const changed = [
      record("closed", "2026-07-26T10:00:00.000Z", 99),
      record("open", "2026-07-27T10:00:00.000Z", 99),
    ];
    const normal = await generateDailySnapshots({
      repositoryRoot: root,
      machine: "angel-mac",
      records: changed,
      pricing: PRICING,
      now: new Date("2026-07-27T13:00:00.000Z"),
    });

    expect(normal.writtenDates).toEqual(["2026-07-27"]);
    expect(normal.protectedClosedDates).toEqual(["2026-07-26"]);
    expect(await inputTokens(root, "2026-07-26")).toBe(1);
    expect(await inputTokens(root, "2026-07-27")).toBe(99);

    const repaired = await generateDailySnapshots({
      repositoryRoot: root,
      machine: "angel-mac",
      records: changed,
      pricing: PRICING,
      now: new Date("2026-07-27T14:00:00.000Z"),
      repairClosedDates: ["2026-07-26"],
    });
    expect(repaired.writtenDates).toEqual(["2026-07-26"]);
    expect(await inputTokens(root, "2026-07-26")).toBe(99);
  });

  it("derives the open day from Europe/Madrid rather than UTC", async () => {
    const root = await temporaryRoot();
    const records = [record("boundary", "2026-07-27T22:30:00.000Z")];

    const first = await generateDailySnapshots({
      repositoryRoot: root,
      machine: "angel-mac",
      records,
      pricing: PRICING,
      now: new Date("2026-07-27T22:45:00.000Z"),
    });

    expect(first.writtenDates).toEqual(["2026-07-28"]);

    const rerun = await generateDailySnapshots({
      repositoryRoot: root,
      machine: "angel-mac",
      records,
      pricing: PRICING,
      now: new Date("2026-07-27T23:15:00.000Z"),
    });

    expect(rerun).toMatchObject({ writtenDates: [], unchangedDates: ["2026-07-28"] });
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tokenviewer-snapshots-"));
  roots.push(root);
  return root;
}

async function snapshotFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  await walk(join(root, "snapshots"), "snapshots", files);
  return files.sort();
}

async function walk(path: string, relative: string, files: string[]): Promise<void> {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const entryPath = join(path, entry.name);
    const relativePath = `${relative}/${entry.name}`;
    if (entry.isDirectory()) await walk(entryPath, relativePath, files);
    else files.push(relativePath);
  }
}

async function inputTokens(root: string, date: string): Promise<number> {
  const source = await readFile(
    join(root, `snapshots/angel-mac/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}.json`),
    "utf8",
  );
  return (JSON.parse(source) as { totals: { inputTokens: number } }).totals.inputTokens;
}

function record(hash: string, timestamp: string, inputTokens = 1): UsageRecord {
  return {
    agent: "codex",
    provider: "unknown-provider",
    model: "unknown-model",
    timestamp,
    inputTokens,
    outputTokens: 2,
    reasoningTokens: 3,
    cacheReadTokens: 4,
    cacheWriteTokens: 5,
    sourceFile: "/private/source.jsonl",
    recordHash: hash,
  };
}
