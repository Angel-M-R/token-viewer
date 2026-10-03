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
  ompAdapter,
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

  it.sequential("parses omp sessions with the pi format under ~/.omp", async () => {
    const root = mkdtempSync(join(tmpdir(), "tv-omp-"));
    process.env.HOME = root;
    const sessionsDir = join(root, ".omp", "agent", "sessions", "project-a");
    await mkdir(sessionsDir, { recursive: true });
    await writeFile(
      join(sessionsDir, "session-a.jsonl"),
      [
        JSON.stringify({
          type: "message",
          timestamp: "2026-10-03T10:00:00.000Z",
          message: {
            role: "assistant",
            provider: "openai-codex",
            model: "gpt-6.1-sol",
            usage: { input: 5, output: 6, cacheRead: 7, cacheWrite: 0 },
          },
        }),
        "",
      ].join("\n"),
      "utf-8",
    );

    const records = await collect(ompAdapter().usage());
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ agent: "omp", model: "gpt-6.1-sol", inputTokens: 5 });
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

  it.sequential("parses opencode 2 session messages without double counting imported rows", async () => {
    const root = mkdtempSync(join(tmpdir(), "tv-opencode2-"));
    process.env.XDG_DATA_HOME = join(root, "data");
    const dataDir = join(process.env.XDG_DATA_HOME, "opencode");
    await mkdir(dataDir, { recursive: true });
    const dbPath = join(dataDir, "opencode.db");
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE message (id TEXT, session_id TEXT, time_created INTEGER, data TEXT);
      CREATE TABLE session_message (
        id TEXT, session_id TEXT, type TEXT, seq INTEGER, time_created INTEGER, data TEXT
      );
    `);
    const legacy = JSON.stringify({
      providerID: "anthropic",
      modelID: "claude-sonnet-4",
      tokens: { input: 13, output: 14, reasoning: 0, cache: { read: 2, write: 1 } },
    });
    db.prepare("INSERT INTO message VALUES (?, ?, ?, ?)").run(
      "msg-a",
      "session-a",
      Date.parse("2026-07-05T10:00:00.000Z"),
      legacy,
    );
    const insertV2 = db.prepare("INSERT INTO session_message VALUES (?, ?, ?, ?, ?, ?)");
    insertV2.run("msg-a", "session-a", "assistant", 1, Date.parse("2026-07-05T10:00:00.000Z"), legacy);
    insertV2.run(
      "msg-b",
      "session-a",
      "assistant",
      2,
      Date.parse("2026-09-29T08:39:52.000Z"),
      JSON.stringify({
        model: { id: "claude-sonnet-5-5", providerID: "anthropic" },
        cost: 0.01,
        tokens: { input: 4, output: 17, reasoning: 0, cache: { read: 0, write: 26212 } },
      }),
    );
    insertV2.run("msg-c", "session-a", "user", 3, Date.parse("2026-09-29T08:40:00.000Z"), "{}");
    db.close();

    const records = await collect(opencodeAdapter().usage());
    expect(records.map((record) => record.nativeId)).toEqual(["msg-a", "msg-b"]);
    expect(records[1]).toMatchObject({
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      billedCost: 0.01,
      inputTokens: 4,
      outputTokens: 17,
      cacheWriteTokens: 26212,
    });
  });

  it.sequential("parses t3code v2 provider-turn usage and dedupes the imported legacy history", async () => {
    const root = mkdtempSync(join(tmpdir(), "tv-t3v2-"));
    process.env.HOME = root;
    process.env.T3CODE_HOME = join(root, ".t3");
    const dataDir = join(process.env.T3CODE_HOME, "userdata");
    await mkdir(dataDir, { recursive: true });
    const schema = `
      CREATE TABLE orchestration_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT,
        stream_id TEXT,
        event_type TEXT,
        occurred_at TEXT,
        payload_json TEXT
      );
    `;
    const legacyEvent = [
      "event-legacy",
      "thread-a",
      "thread.activity-appended",
      "2026-10-02T10:00:00.000Z",
      JSON.stringify({
        threadId: "thread-a",
        activity: {
          kind: "context-window.updated",
          createdAt: "2026-10-02T10:00:00.000Z",
          turnId: "turn-a",
          payload: { inputTokens: 20, outputTokens: 9 },
        },
      }),
    ];
    const insertEvent =
      "INSERT INTO orchestration_events (event_id, stream_id, event_type, occurred_at, payload_json) VALUES (?, ?, ?, ?, ?)";

    const legacyDb = new DatabaseSync(join(dataDir, "state.sqlite"));
    legacyDb.exec(schema);
    legacyDb.prepare(insertEvent).run(...legacyEvent);
    legacyDb.close();

    const db = new DatabaseSync(join(dataDir, "statev2.sqlite"));
    db.exec(`
      ${schema}
      CREATE TABLE orchestration_v2_projection_threads (thread_id TEXT, payload_json TEXT);
      CREATE TABLE orchestration_v2_projection_nodes (node_id TEXT, run_id TEXT);
      CREATE TABLE orchestration_v2_projection_runs (run_id TEXT, payload_json TEXT);
    `);
    db.prepare(insertEvent).run(...legacyEvent);
    db.prepare("INSERT INTO orchestration_v2_projection_threads VALUES (?, ?)").run(
      "thread-b",
      JSON.stringify({ providerInstanceId: "codex", modelSelection: { model: "gpt-thread" } }),
    );
    db.prepare("INSERT INTO orchestration_v2_projection_nodes VALUES (?, ?)").run("node-root", "run-1");
    db.prepare("INSERT INTO orchestration_v2_projection_runs VALUES (?, ?)").run(
      "run-1",
      JSON.stringify({ providerInstanceId: "codex", modelSelection: { model: "gpt-run" } }),
    );
    const turn = (tokenUsage: unknown, status = "running") =>
      JSON.stringify({
        id: "provider-turn-1",
        nodeId: "node-root",
        nativeTurnRef: { driver: "codex" },
        status,
        tokenUsage,
      });
    const firstRequest = {
      inputTokens: 100,
      cachedInputTokens: 80,
      outputTokens: 10,
      reasoningOutputTokens: 4,
      updatedAt: "2026-10-03T10:00:01.000Z",
    };
    const secondRequest = { ...firstRequest, inputTokens: 120, updatedAt: "2026-10-03T10:00:05.000Z" };
    for (const [eventId, payload] of [
      ["event-1", turn(undefined)],
      ["event-2", turn(firstRequest)],
      ["event-3", turn(firstRequest)],
      ["event-4", turn(secondRequest)],
      ["event-5", turn(undefined, "completed")],
    ]) {
      db.prepare(insertEvent).run(
        eventId,
        "thread-b",
        "provider-turn.updated",
        "2026-10-03T10:00:00.000Z",
        payload,
      );
    }
    db.close();

    const records = await collect(t3codeAdapter().usage());
    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({ session: "thread-a", sourceFile: join(dataDir, "state.sqlite") });
    expect(records.slice(1)).toMatchObject([
      {
        provider: "openai",
        model: "gpt-run",
        session: "thread-b",
        timestamp: "2026-10-03T10:00:01.000Z",
        inputTokens: 20,
        cacheReadTokens: 80,
        outputTokens: 6,
        reasoningTokens: 4,
      },
      { inputTokens: 40, timestamp: "2026-10-03T10:00:05.000Z" },
    ]);
  });

  it.sequential("parses t3code context-window usage events", async () => {
    const root = mkdtempSync(join(tmpdir(), "tv-t3-"));
    process.env.HOME = root;
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
