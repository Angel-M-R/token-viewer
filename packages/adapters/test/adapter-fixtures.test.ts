import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  ampAdapter,
  codexAdapter,
  cursorAdapter,
  opencodeAdapter,
  piAdapter,
  t3codeAdapter,
} from "../src/index.js";

const envBackup = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in envBackup)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, envBackup);
});

describe.sequential("adapter fixtures", () => {
  it.sequential("parses codex token_count JSONL", async () => {
    const root = mkdtempSync(join(tmpdir(), "tv-codex-"));
    process.env.CODEX_HOME = root;
    const sessionsDir = join(root, "sessions", "2026", "07", "05");
    await mkdir(sessionsDir, { recursive: true });
    await writeFile(
      join(sessionsDir, "rollout-12345678-1234-1234-1234-123456789abc.jsonl"),
      [
        JSON.stringify({ type: "session_meta", payload: { id: "session-a" } }),
        JSON.stringify({ type: "turn_context", payload: { model: "gpt-5" } }),
        JSON.stringify({
          type: "event_msg",
          timestamp: "2026-07-05T10:00:00.000Z",
          payload: {
            type: "token_count",
            info: {
              last_token_usage: {
                input_tokens: 10,
                cached_input_tokens: 2,
                output_tokens: 7,
                reasoning_output_tokens: 3,
              },
            },
          },
        }),
        "",
      ].join("\n"),
      "utf-8",
    );

    const records = await collect(codexAdapter().usage());
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      agent: "codex",
      provider: "openai",
      model: "gpt-5",
      session: "session-a",
      inputTokens: 8,
      outputTokens: 4,
      reasoningTokens: 3,
      cacheReadTokens: 2,
    });
  });

  it.sequential("parses amp usageLedger JSON", async () => {
    const root = mkdtempSync(join(tmpdir(), "tv-amp-"));
    process.env.XDG_DATA_HOME = join(root, "data");
    const threadsDir = join(process.env.XDG_DATA_HOME, "amp", "threads");
    await mkdir(threadsDir, { recursive: true });
    await writeFile(
      join(threadsDir, "thread-a.json"),
      JSON.stringify({
        usageLedger: [
          {
            provider: "anthropic",
            model: "claude-sonnet-4",
            timestamp: "2026-07-05T10:00:00.000Z",
            usage: { inputTokens: 5, outputTokens: 6, cacheReadTokens: 1 },
          },
        ],
      }),
      "utf-8",
    );

    const records = await collect(ampAdapter().usage());
    expect(records[0]).toMatchObject({
      agent: "amp",
      provider: "anthropic",
      model: "claude-sonnet-4",
      inputTokens: 5,
      outputTokens: 6,
      cacheReadTokens: 1,
    });
  });

  it.sequential("parses pi assistant usage JSONL", async () => {
    const root = mkdtempSync(join(tmpdir(), "tv-pi-"));
    process.env.HOME = root;
    const sessionsDir = join(root, ".pi", "agent", "sessions", "project-a");
    await mkdir(sessionsDir, { recursive: true });
    await writeFile(
      join(sessionsDir, "session-a.jsonl"),
      [
        JSON.stringify({ type: "session", cwd: "/repo/project-a" }),
        JSON.stringify({
          type: "message",
          timestamp: "2026-07-05T10:00:00.000Z",
          message: {
            role: "assistant",
            provider: "anthropic",
            model: "claude-sonnet-4",
            usage: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 },
          },
        }),
        "",
      ].join("\n"),
      "utf-8",
    );

    const records = await collect(piAdapter().usage());
    expect(records[0]).toMatchObject({
      agent: "pi",
      provider: "anthropic",
      model: "claude-sonnet-4",
      project: "/repo/project-a",
      inputTokens: 1,
      outputTokens: 2,
      cacheReadTokens: 3,
      cacheWriteTokens: 4,
    });
  });

  it.sequential("parses cursor bubble token counts from state.vscdb", async () => {
    const root = mkdtempSync(join(tmpdir(), "tv-cursor-"));
    process.env.HOME = root;
    process.env.XDG_CONFIG_HOME = join(root, "config");
    const userDir = join(process.env.XDG_CONFIG_HOME, "Cursor", "User", "globalStorage");
    await mkdir(userDir, { recursive: true });
    const dbPath = join(userDir, "state.vscdb");
    const db = new DatabaseSync(dbPath);
    db.exec("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)");
    db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)").run(
      "bubbleId:composer-a",
      JSON.stringify({
        type: 2,
        model: "gpt-5",
        createdAt: "2026-07-05T10:00:00.000Z",
        tokenCount: { inputTokens: 11, outputTokens: 12, reasoningTokens: 2 },
      }),
    );
    db.close();

    const records = await collect(cursorAdapter().usage());
    expect(records[0]).toMatchObject({
      agent: "cursor",
      model: "gpt-5",
      session: "composer-a",
      inputTokens: 11,
      outputTokens: 12,
      reasoningTokens: 2,
    });
  });

  it.sequential("parses opencode billed cost and tokens", async () => {
    const root = mkdtempSync(join(tmpdir(), "tv-opencode-"));
    process.env.XDG_DATA_HOME = join(root, "data");
    const dataDir = join(process.env.XDG_DATA_HOME, "opencode");
    await mkdir(dataDir, { recursive: true });
    const dbPath = join(dataDir, "opencode.db");
    const db = new DatabaseSync(dbPath);
    db.exec("CREATE TABLE message (id TEXT, session_id TEXT, time_created INTEGER, data TEXT)");
    db.prepare("INSERT INTO message (id, session_id, time_created, data) VALUES (?, ?, ?, ?)").run(
      "msg-a",
      "session-a",
      Date.parse("2026-07-05T10:00:00.000Z"),
      JSON.stringify({
        providerID: "anthropic",
        modelID: "claude-sonnet-4",
        cost: 0.05,
        tokens: { input: 13, output: 14, reasoning: 0, cache: { read: 2, write: 1 } },
      }),
    );
    db.close();

    const records = await collect(opencodeAdapter().usage());
    expect(records[0]).toMatchObject({
      agent: "opencode",
      provider: "anthropic",
      model: "claude-sonnet-4",
      billedCost: 0.05,
      inputTokens: 13,
      outputTokens: 14,
      cacheReadTokens: 2,
      cacheWriteTokens: 1,
    });
  });

  it.sequential("parses t3code context-window usage events", async () => {
    const root = mkdtempSync(join(tmpdir(), "tv-t3-"));
    process.env.T3CODE_HOME = join(root, ".t3");
    const dataDir = join(process.env.T3CODE_HOME, "userdata");
    await mkdir(dataDir, { recursive: true });
    const dbPath = join(dataDir, "state.sqlite");
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE projection_threads (thread_id TEXT, model_selection_json TEXT);
      CREATE TABLE orchestration_events (
        event_id TEXT,
        stream_id TEXT,
        event_type TEXT,
        occurred_at TEXT,
        payload_json TEXT
      );
    `);
    db.prepare("INSERT INTO projection_threads (thread_id, model_selection_json) VALUES (?, ?)").run(
      "thread-a",
      JSON.stringify({ provider: "codex", model: "openai/gpt-5" }),
    );
    db.prepare(
      "INSERT INTO orchestration_events (event_id, stream_id, event_type, occurred_at, payload_json) VALUES (?, ?, ?, ?, ?)",
    ).run(
      "event-a",
      "thread-a",
      "thread.activity-appended",
      "2026-07-05T10:00:00.000Z",
      JSON.stringify({
        threadId: "thread-a",
        activity: {
          kind: "context-window.updated",
          createdAt: "2026-07-05T10:00:00.000Z",
          turnId: "turn-a",
          payload: {
            inputTokens: 20,
            cachedInputTokens: 5,
            outputTokens: 9,
            reasoningOutputTokens: 4,
          },
        },
      }),
    );
    db.close();

    const records = await collect(t3codeAdapter().usage());
    expect(records[0]).toMatchObject({
      agent: "t3code",
      provider: "openai",
      model: "openai/gpt-5",
      session: "thread-a",
      inputTokens: 15,
      outputTokens: 5,
      reasoningTokens: 4,
      cacheReadTokens: 5,
    });
  });
});

async function collect<T>(records: AsyncGenerator<T>): Promise<T[]> {
  const output: T[] = [];
  for await (const record of records) {
    output.push(record);
  }
  return output;
}
