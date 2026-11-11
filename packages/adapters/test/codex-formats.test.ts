import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { codexAdapter } from "../src/codex.js";
import type { FileCursorMap, UsageOptions, UsageRecord } from "@tokenviewer/core";

const originalCodexHome = process.env.CODEX_HOME;
const roots: string[] = [];
const timestamp = "2026-11-07T10:00:00.000Z";

afterEach(async () => {
  if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = originalCodexHome;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe.sequential("Codex usage formats", () => {
  it("reads canonical-only responses, including distinct responses with identical usage", async () => {
    const root = await setup();
    await session(root, "sessions", [context("turn-a"), canonical("response-a"), canonical("response-b")]);

    const records = await collect();
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      agent: "codex", provider: "openai", model: "gpt-6.1-sol", timestamp,
      inputTokens: 20, outputTokens: 7, reasoningTokens: 3, cacheReadTokens: 80,
    });
    expect(total(records)).toBe(220);
  });

  it.each([false, true])("counts a mirrored response once, canonical first: %s", async (canonicalFirst) => {
    const root = await setup();
    const pair = [canonical("response-a"), legacy(usage())];
    await session(root, "sessions", [context("turn-a"), ...(canonicalFirst ? pair : pair.reverse())]);

    const records = await collect();
    expect(records).toHaveLength(1);
    expect(total(records)).toBe(110);
  });

  it("includes a canonical response whose legacy mirror reports zero after compaction", async () => {
    const root = await setup();
    await session(root, "sessions", [
      context("turn-a"), canonical("response-a"), legacy(usage()),
      canonical("response-compaction", usage(40, 2)), legacy(usage(0, 0)),
    ]);

    const records = await collect();
    expect(records).toHaveLength(2);
    expect(total(records)).toBe(152);
  });

  it("keeps legacy-only turns when a session upgrades to canonical records", async () => {
    const root = await setup();
    await session(root, "sessions", [
      context("legacy-turn"), legacy(usage(20, 2)),
      context("turn-a"), canonical("response-a"), legacy(usage()),
    ]);

    const records = await collect();
    expect(records).toHaveLength(2);
    expect(total(records)).toBe(132);
  });

  it("deduplicates canonical response IDs across active and archived copies", async () => {
    const root = await setup();
    for (const directory of ["sessions", "archived_sessions"]) {
      await session(root, directory, [context("turn-a"), canonical("response-a"), legacy(usage())]);
    }

    const records = await collect();
    expect(records).toHaveLength(1);
    expect(total(records)).toBe(110);
  });

  it("falls back to legacy usage if a canonical record has no response identity", async () => {
    const root = await setup();
    const malformed = canonical("response-a");
    malformed.payload.response_id = "";
    await session(root, "sessions", [context("turn-a"), malformed, legacy(usage())]);

    const records = await collect();
    expect(records).toHaveLength(1);
    expect(total(records)).toBe(110);
  });

  it("preserves unmatched legacy responses when only part of a turn has valid canonical records", async () => {
    const root = await setup();
    const malformed = canonical("response-b", usage(30, 3));
    malformed.payload.response_id = "";
    await session(root, "sessions", [
      context("turn-a"), canonical("response-a"), legacy(usage()),
      malformed, legacy(usage(30, 3)),
    ]);

    expect(total(await collect())).toBe(143);
  });

  it("does not carry canonical suppression across an older context without a turn ID", async () => {
    const root = await setup();
    await session(root, "sessions", [
      context("turn-a"), canonical("response-a"), legacy(usage()),
      { type: "turn_context", payload: { model: "gpt-6.1-sol" } }, legacy(usage(20, 2)),
    ]);

    expect(total(await collect())).toBe(132);
  });

  it("does not let a canonical record from another turn hide unmatched usage", async () => {
    const root = await setup();
    const other = canonical("response-other");
    other.payload.turn_id = "turn-b";
    await session(root, "sessions", [context("turn-a"), other, legacy(usage(20, 2))]);

    expect(total(await collect())).toBe(132);
  });

  it.each([false, true])("does not recount a mirror appended in a later scan, canonical first: %s", async (canonicalFirst) => {
    const root = await setup();
    const pair = [canonical("response-a"), legacy(usage())];
    if (!canonicalFirst) pair.reverse();
    await session(root, "sessions", [context("turn-a"), pair[0]]);
    const cursors: FileCursorMap = {};
    const options: UsageOptions = { cursors, onFileComplete: (path, cursor) => { cursors[path] = cursor; } };

    expect(total(await collect(options))).toBe(110);
    await appendFile(join(root, "sessions", "session.jsonl"), `${JSON.stringify(pair[1])}\n`);
    expect(await collect(options)).toEqual([]);
    expect(total(await collect())).toBe(110);
  });
});

async function setup(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tv-codex-formats-"));
  roots.push(root);
  process.env.CODEX_HOME = root;
  return root;
}

async function session(root: string, directory: string, entries: unknown[]): Promise<void> {
  const path = join(root, directory);
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "session.jsonl"), [
    JSON.stringify({ type: "session_meta", payload: { id: "session-a" } }),
    ...entries.map((entry) => JSON.stringify(entry)), "",
  ].join("\n"));
}

function context(turn: string) {
  return { type: "turn_context", payload: { turn_id: turn, model: "gpt-6.1-sol" } };
}

function usage(input = 100, output = 10) {
  return {
    input_tokens: input, cached_input_tokens: Math.min(80, input), output_tokens: output,
    reasoning_output_tokens: Math.min(3, output), total_tokens: input + output,
  };
}

function canonical(response: string, counts = usage()) {
  return {
    type: "token_usage_record", timestamp,
    payload: { thread_id: "session-a", session_id: "session-a", turn_id: "turn-a", response_id: response, usage: counts },
  };
}

function legacy(counts: ReturnType<typeof usage>) {
  return { type: "event_msg", timestamp, payload: { type: "token_count", info: { last_token_usage: counts } } };
}

async function collect(options: UsageOptions = { full: true }): Promise<UsageRecord[]> {
  const records: UsageRecord[] = [];
  for await (const record of codexAdapter().usage(options)) records.push(record);
  return records;
}

function total(records: UsageRecord[]): number {
  return records.reduce((sum, r) => sum + r.inputTokens + r.outputTokens + r.reasoningTokens + r.cacheReadTokens + r.cacheWriteTokens, 0);
}
