import { stat } from "node:fs/promises";
import {
  t3DatabaseCandidates,
  type Adapter,
  type T3DatabaseLocation,
  type UsageOptions,
  type UsageRecord,
} from "@tokenviewer/core";
import { completeSqliteSource, shouldUseSqliteSource } from "./source-files.js";
import { openReadonlySqliteDatabase, type SqliteDatabase } from "./sqlite.js";
import { asRecord, stringValue, withRecordHash } from "./utils.js";

interface ThreadInfo {
  provider?: string;
  model?: string;
}

interface ParsedUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function t3codeAdapter(): Adapter {
  return {
    name: "t3code",
    async detect(): Promise<boolean> {
      return (await discoverT3Databases()).length > 0;
    },
    async *usage(options?: UsageOptions): AsyncGenerator<UsageRecord> {
      const seen = new Set<string>();

      for (const location of await discoverT3Databases()) {
        if (!(await shouldUseSqliteSource(location.path, options))) {
          continue;
        }

        const db = await openReadonlySqliteDatabase(location.path);
        if (!db) {
          options?.onWarning?.(`SQLite support not available, skipping t3code store ${location.path}`);
          options?.onFileSkipped?.(location.path, "unsupported");
          continue;
        }

        try {
          yield* queryUsageRecords(db, location, seen, options);
          await completeSqliteSource(location.path, options);
        } finally {
          db.close();
        }
      }
    },
  };
}

async function discoverT3Databases(): Promise<T3DatabaseLocation[]> {
  const locations: T3DatabaseLocation[] = [];
  for (const location of t3DatabaseCandidates()) {
    if (await stat(location.path).catch(() => null)) {
      locations.push(location);
    }
  }
  return locations;
}

function* queryUsageRecords(
  db: SqliteDatabase,
  location: T3DatabaseLocation,
  seen: Set<string>,
  options?: UsageOptions,
): Generator<UsageRecord> {
  if (
    !hasColumns(db, "orchestration_events", [
      "event_id",
      "stream_id",
      "event_type",
      "occurred_at",
      "payload_json",
    ])
  ) {
    return;
  }

  const threadInfo = readThreadInfo(db);
  const orderColumn = hasColumns(db, "orchestration_events", ["sequence"]) ? "sequence" : "event_id";
  let query = `
    SELECT event_id, stream_id, occurred_at, payload_json
    FROM orchestration_events
    WHERE event_type = 'thread.activity-appended'
  `;
  const params: unknown[] = [];
  if (options?.since) {
    query += ` AND occurred_at >= ?`;
    params.push(options.since.toISOString());
  }
  query += ` ORDER BY occurred_at ASC, ${orderColumn} ASC`;

  let rows: {
    event_id: unknown;
    stream_id: unknown;
    occurred_at: unknown;
    payload_json: unknown;
  }[];
  try {
    rows = db.prepare(query).all(...params) as typeof rows;
  } catch {
    return;
  }

  for (const row of rows) {
    const payload = asRecord(parseJson(row.payload_json));
    const activity = asRecord(payload?.["activity"]);
    if (activity?.["kind"] !== "context-window.updated") {
      continue;
    }

    const usage = parseUsageSnapshot(activity["payload"]);
    if (!usage || !hasBillableUsage(usage)) {
      continue;
    }

    const threadId = stringValue(payload?.["threadId"]) ?? stringValue(row.stream_id);
    const timestamp = stringValue(activity["createdAt"]) ?? stringValue(row.occurred_at);
    const turnId = stringValue(activity["turnId"]);
    const info = threadId ? threadInfo.get(threadId) : undefined;
    const provider = normalizeT3Provider(info?.provider, info?.model);
    const nativeId = JSON.stringify([
      location.scope,
      threadId ?? "",
      turnId ?? "",
      stringValue(row.event_id) ?? "",
    ]);

    const record = withRecordHash({
      agent: "t3code",
      provider,
      model: info?.model,
      timestamp,
      session: threadId,
      project: location.scope,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      reasoningTokens: usage.reasoningTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      sourceFile: location.path,
      nativeId,
    });

    if (seen.has(record.recordHash)) {
      continue;
    }
    seen.add(record.recordHash);
    yield record;
  }
}

function normalizeT3Provider(
  provider: string | undefined,
  model: string | undefined,
): string | undefined {
  const normalized = provider?.trim().toLowerCase();
  const key = normalized?.replace(/[^a-z0-9]/g, "");
  switch (key) {
    case "codex":
      return "openai";
    case "claudeagent":
    case "claudecode":
      return "anthropic";
    case "cursor":
    case "opencode":
      return undefined;
    default:
      if (key?.includes("codex")) {
        return "openai";
      }
      if (key?.includes("claude")) {
        return "anthropic";
      }
      if (normalized === "openai" || normalized === "anthropic") {
        return normalized;
      }
      return providerFromModel(model);
  }
}

function providerFromModel(model: string | undefined): string | undefined {
  const slash = model?.indexOf("/") ?? -1;
  if (!model || slash <= 0) {
    return undefined;
  }

  return model.slice(0, slash);
}

function readThreadInfo(db: SqliteDatabase): Map<string, ThreadInfo> {
  const info = new Map<string, ThreadInfo>();

  readProjectionThreadModels(db, info);
  readProjectionThreadProviders(db, info);

  return info;
}

function readProjectionThreadModels(db: SqliteDatabase, info: Map<string, ThreadInfo>): void {
  if (!tableExists(db, "projection_threads")) {
    return;
  }

  const columns = tableColumns(db, "projection_threads");
  if (!columns.has("thread_id")) {
    return;
  }

  try {
    if (columns.has("model_selection_json")) {
      const rows = db
        .prepare("SELECT thread_id, model_selection_json FROM projection_threads")
        .all() as { thread_id: unknown; model_selection_json: unknown }[];
      for (const row of rows) {
        const threadId = stringValue(row.thread_id);
        const modelSelection = asRecord(parseJson(row.model_selection_json));
        if (!threadId || !modelSelection) {
          continue;
        }
        const entry = info.get(threadId) ?? {};
        entry.model = stringValue(modelSelection["model"]) ?? entry.model;
        entry.provider =
          stringValue(modelSelection["provider"]) ??
          stringValue(modelSelection["instanceId"]) ??
          entry.provider;
        info.set(threadId, entry);
      }
      return;
    }

    if (columns.has("model")) {
      const rows = db.prepare("SELECT thread_id, model FROM projection_threads").all() as {
        thread_id: unknown;
        model: unknown;
      }[];
      for (const row of rows) {
        const threadId = stringValue(row.thread_id);
        const model = stringValue(row.model);
        if (threadId && model) {
          info.set(threadId, { ...info.get(threadId), model });
        }
      }
    }
  } catch {
    return;
  }
}

function readProjectionThreadProviders(db: SqliteDatabase, info: Map<string, ThreadInfo>): void {
  if (!hasColumns(db, "projection_thread_sessions", ["thread_id", "provider_name"])) {
    return;
  }

  try {
    const rows = db.prepare("SELECT thread_id, provider_name FROM projection_thread_sessions").all() as {
      thread_id: unknown;
      provider_name: unknown;
    }[];
    for (const row of rows) {
      const threadId = stringValue(row.thread_id);
      const provider = stringValue(row.provider_name);
      if (!threadId || !provider) {
        continue;
      }
      info.set(threadId, { ...info.get(threadId), provider });
    }
  } catch {
    return;
  }
}

function parseUsageSnapshot(value: unknown): ParsedUsage | null {
  const usage = asRecord(value);
  if (!usage) {
    return null;
  }

  const lastInputTokens = tokenValue(usage["lastInputTokens"] ?? usage["last_input_tokens"]);
  const lastCachedInputTokens = tokenValue(
    usage["lastCachedInputTokens"] ?? usage["last_cached_input_tokens"],
  );
  const lastOutputTokens = tokenValue(usage["lastOutputTokens"] ?? usage["last_output_tokens"]);
  const lastReasoningOutputTokens = tokenValue(
    usage["lastReasoningOutputTokens"] ?? usage["last_reasoning_output_tokens"],
  );
  const hasLastDetails = [
    lastInputTokens,
    lastCachedInputTokens,
    lastOutputTokens,
    lastReasoningOutputTokens,
  ].some((token) => token !== undefined);

  if (hasLastDetails) {
    return splitTokenUsage({
      inputTokens: lastInputTokens ?? 0,
      cachedInputTokens: lastCachedInputTokens ?? 0,
      outputTokens: lastOutputTokens ?? 0,
      reasoningOutputTokens: lastReasoningOutputTokens ?? 0,
    });
  }

  const inputTokens = tokenValue(usage["inputTokens"] ?? usage["input_tokens"]);
  const cachedInputTokens = tokenValue(usage["cachedInputTokens"] ?? usage["cached_input_tokens"]);
  const outputTokens = tokenValue(usage["outputTokens"] ?? usage["output_tokens"]);
  const reasoningOutputTokens = tokenValue(
    usage["reasoningOutputTokens"] ?? usage["reasoning_output_tokens"],
  );
  const hasSnapshotDetails = [
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
  ].some((token) => token !== undefined);

  if (!hasSnapshotDetails) {
    return null;
  }

  return splitTokenUsage({
    inputTokens: inputTokens ?? 0,
    cachedInputTokens: cachedInputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    reasoningOutputTokens: reasoningOutputTokens ?? 0,
  });
}

function splitTokenUsage(input: {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}): ParsedUsage {
  const reasoningTokens = Math.min(input.reasoningOutputTokens, input.outputTokens);
  return {
    inputTokens: Math.max(input.inputTokens - input.cachedInputTokens, 0),
    outputTokens: Math.max(input.outputTokens - reasoningTokens, 0),
    reasoningTokens,
    cacheReadTokens: input.cachedInputTokens,
    cacheWriteTokens: 0,
  };
}

function hasBillableUsage(usage: ParsedUsage): boolean {
  return (
    usage.inputTokens +
      usage.outputTokens +
      usage.reasoningTokens +
      usage.cacheReadTokens +
      usage.cacheWriteTokens >
    0
  );
}

function hasColumns(db: SqliteDatabase, table: string, requiredColumns: string[]): boolean {
  const columns = tableColumns(db, table);
  return requiredColumns.every((column) => columns.has(column));
}

function tableExists(db: SqliteDatabase, table: string): boolean {
  try {
    const row = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
      .get(table);
    return Boolean(row);
  } catch {
    return false;
  }
}

function tableColumns(db: SqliteDatabase, table: string): Set<string> {
  if (!tableExists(db, table)) {
    return new Set();
  }

  try {
    const rows = db.prepare(`PRAGMA table_info("${table}")`).all() as { name: unknown }[];
    return new Set(rows.flatMap((row) => stringValue(row.name) ?? []));
  } catch {
    return new Set();
  }
}

function parseJson(value: unknown): unknown | null {
  if (typeof value !== "string") {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function tokenValue(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(Math.round(value), 0);
}
