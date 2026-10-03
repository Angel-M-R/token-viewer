import { stat } from "node:fs/promises";
import {
  t3DatabaseCandidates,
  type Adapter,
  type T3DatabaseLocation,
  type UsageOptions,
  type UsageRecord,
} from "@tokenviewer/core";
import { completeSqliteSource, shouldUseSqliteSource } from "./source-files.js";
import {
  hasColumns,
  openReadonlySqliteDatabase,
  tableColumns,
  tableExists,
  type SqliteDatabase,
} from "./sqlite.js";
import { asRecord, stringValue, withRecordHash } from "./utils.js";

interface ThreadInfo {
  provider?: string;
  model?: string;
}

interface EventRow {
  event_id: unknown;
  stream_id: unknown;
  event_type: unknown;
  occurred_at: unknown;
  payload_json: unknown;
  run_payload_json: unknown;
}

interface UsageEntry {
  usage: ParsedUsage;
  threadId?: string;
  turnId?: string;
  usageId: string;
  timestamp?: string;
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
  const v2ThreadInfo = readV2ThreadInfo(db);
  const joinRuns =
    hasColumns(db, "orchestration_v2_projection_nodes", ["node_id", "run_id"]) &&
    hasColumns(db, "orchestration_v2_projection_runs", ["run_id", "payload_json"]);
  const orderColumn = hasColumns(db, "orchestration_events", ["sequence"]) ? "sequence" : "event_id";
  let query = `
    SELECT e.event_id, e.stream_id, e.event_type, e.occurred_at, e.payload_json,
      ${joinRuns ? "r.payload_json" : "NULL"} AS run_payload_json
    FROM orchestration_events e
    ${
      joinRuns
        ? `LEFT JOIN orchestration_v2_projection_nodes n
            ON e.event_type = 'provider-turn.updated'
            AND n.node_id = json_extract(e.payload_json, '$.nodeId')
          LEFT JOIN orchestration_v2_projection_runs r ON r.run_id = n.run_id`
        : ""
    }
    WHERE e.event_type IN ('thread.activity-appended', 'provider-turn.updated')
  `;
  const params: unknown[] = [];
  if (options?.since) {
    query += ` AND e.occurred_at >= ?`;
    params.push(options.since.toISOString());
  }
  query += ` ORDER BY e.occurred_at ASC, e.${orderColumn} ASC`;

  let rows: EventRow[];
  try {
    rows = db.prepare(query).all(...params) as EventRow[];
  } catch {
    return;
  }

  for (const row of rows) {
    const payload = asRecord(parseJson(row.payload_json));
    const entry =
      row.event_type === "provider-turn.updated"
        ? parseProviderTurnUsage(row, payload, v2ThreadInfo, threadInfo)
        : parseActivityUsage(row, payload, threadInfo);
    if (!entry || !hasBillableUsage(entry.usage)) {
      continue;
    }

    // Keyed on nativeId rather than recordHash: statev2.sqlite re-imports the legacy events
    // of state.sqlite under the same ids, and recordHash also covers sourceFile.
    const nativeId = JSON.stringify([location.scope, entry.threadId ?? "", entry.turnId ?? "", entry.usageId]);
    if (seen.has(nativeId)) {
      continue;
    }
    seen.add(nativeId);

    yield withRecordHash({
      agent: "t3code",
      provider: normalizeT3Provider(entry.provider, entry.model),
      model: entry.model,
      timestamp: entry.timestamp,
      session: entry.threadId,
      project: location.scope,
      inputTokens: entry.usage.inputTokens,
      outputTokens: entry.usage.outputTokens,
      reasoningTokens: entry.usage.reasoningTokens,
      cacheReadTokens: entry.usage.cacheReadTokens,
      cacheWriteTokens: entry.usage.cacheWriteTokens,
      sourceFile: location.path,
      nativeId,
    });
  }
}

/** T3 Code v1: `context-window.updated` activities appended to the thread. */
function parseActivityUsage(
  row: EventRow,
  payload: Record<string, unknown> | null,
  threadInfo: Map<string, ThreadInfo>,
): UsageEntry | null {
  const activity = asRecord(payload?.["activity"]);
  if (activity?.["kind"] !== "context-window.updated") {
    return null;
  }

  const usage = parseUsageSnapshot(activity["payload"]);
  if (!usage) {
    return null;
  }

  const threadId = stringValue(payload?.["threadId"]) ?? stringValue(row.stream_id);
  const info = threadId ? threadInfo.get(threadId) : undefined;
  return {
    usage,
    threadId,
    turnId: stringValue(activity["turnId"]),
    usageId: stringValue(row.event_id) ?? "",
    timestamp: stringValue(activity["createdAt"]) ?? stringValue(row.occurred_at),
    provider: info?.provider,
    model: info?.model,
  };
}

/**
 * T3 Code v2: each provider request refreshes the turn's `tokenUsage` snapshot, so every
 * distinct `updatedAt` is one request. Status-only updates repeat the last snapshot.
 */
function parseProviderTurnUsage(
  row: EventRow,
  payload: Record<string, unknown> | null,
  v2ThreadInfo: Map<string, ThreadInfo>,
  threadInfo: Map<string, ThreadInfo>,
): UsageEntry | null {
  const tokenUsage = asRecord(payload?.["tokenUsage"]);
  const usage = parseUsageSnapshot(tokenUsage);
  if (!usage) {
    return null;
  }

  const threadId = stringValue(row.stream_id);
  const run = asRecord(parseJson(row.run_payload_json));
  const runSelection = asRecord(run?.["modelSelection"]);
  const thread = threadId ? (v2ThreadInfo.get(threadId) ?? threadInfo.get(threadId)) : undefined;
  const updatedAt = stringValue(tokenUsage?.["updatedAt"]);
  return {
    usage,
    threadId,
    turnId: stringValue(payload?.["id"]),
    usageId: updatedAt ?? stringValue(row.event_id) ?? "",
    timestamp: updatedAt ?? stringValue(row.occurred_at),
    provider:
      stringValue(asRecord(payload?.["nativeTurnRef"])?.["driver"]) ??
      stringValue(run?.["providerInstanceId"]) ??
      thread?.provider,
    model: stringValue(runSelection?.["model"]) ?? thread?.model,
  };
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

function readV2ThreadInfo(db: SqliteDatabase): Map<string, ThreadInfo> {
  const info = new Map<string, ThreadInfo>();
  if (!hasColumns(db, "orchestration_v2_projection_threads", ["thread_id", "payload_json"])) {
    return info;
  }

  try {
    const rows = db
      .prepare("SELECT thread_id, payload_json FROM orchestration_v2_projection_threads")
      .all() as { thread_id: unknown; payload_json: unknown }[];
    for (const row of rows) {
      const threadId = stringValue(row.thread_id);
      const payload = asRecord(parseJson(row.payload_json));
      const modelSelection = asRecord(payload?.["modelSelection"]);
      if (!threadId || !payload) {
        continue;
      }
      info.set(threadId, {
        model: stringValue(modelSelection?.["model"]),
        provider:
          stringValue(payload["providerInstanceId"]) ?? stringValue(modelSelection?.["instanceId"]),
      });
    }
  } catch {
    return info;
  }

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
