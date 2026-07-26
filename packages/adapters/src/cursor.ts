import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  cursorUserDirs,
  type Adapter,
  type UsageOptions,
  type UsageRecord,
} from "@tokenviewer/core";
import { completeSqliteSource, shouldUseSqliteSource } from "./source-files.js";
import { openReadonlySqliteDatabase, type SqliteDatabase } from "./sqlite.js";
import {
  asRecord,
  normalizeTimestamp,
  numberValue,
  stringValue,
  withRecordHash,
} from "./utils.js";

const STATE_TABLES = ["ItemTable", "cursorDiskKV"];

interface CursorStateStore {
  path: string;
  scope: string;
  project?: string;
}

interface StateRow {
  key: string;
  value: unknown;
}

export function cursorAdapter(): Adapter {
  return {
    name: "cursor",
    async detect(): Promise<boolean> {
      return (await discoverCursorStateStores()).length > 0;
    },
    async *usage(options?: UsageOptions): AsyncGenerator<UsageRecord> {
      const stores = await discoverCursorStateStores();

      for (const store of stores) {
        if (!(await shouldUseSqliteSource(store.path, options))) {
          continue;
        }

        const db = await openReadonlySqliteDatabase(store.path);
        if (!db) {
          options?.onWarning?.(`SQLite support not available, skipping cursor store ${store.path}`);
          options?.onFileSkipped?.(store.path, "unsupported");
          continue;
        }

        try {
          yield* parseCursorUsageStore(db, store, options);
          await completeSqliteSource(store.path, options);
        } finally {
          db.close();
        }
      }
    },
  };
}

async function discoverCursorStateStores(): Promise<CursorStateStore[]> {
  const stores: CursorStateStore[] = [];
  const seen = new Set<string>();

  for (const userDir of cursorUserDirs()) {
    if (!(await stat(userDir).catch(() => null))) {
      continue;
    }

    const globalState = join(userDir, "globalStorage", "state.vscdb");
    if ((await stat(globalState).catch(() => null)) && !seen.has(globalState)) {
      seen.add(globalState);
      stores.push({ path: globalState, scope: "global" });
    }

    const workspaceRoot = join(userDir, "workspaceStorage");
    const workspaceIds = await readdir(workspaceRoot).catch(() => []);
    for (const workspaceId of workspaceIds) {
      const statePath = join(workspaceRoot, workspaceId, "state.vscdb");
      if ((await stat(statePath).catch(() => null)) && !seen.has(statePath)) {
        seen.add(statePath);
        stores.push({ path: statePath, scope: "workspace", project: workspaceId });
      }
    }
  }

  return stores;
}

function* parseCursorUsageStore(
  db: SqliteDatabase,
  store: CursorStateStore,
  options?: UsageOptions,
): Generator<UsageRecord> {
  const rows = readStateRows(db);
  const composerModels = collectComposerModels(rows);
  const seen = new Set<string>();

  for (const row of rows) {
    try {
      if (!row.key.startsWith("bubbleId:")) {
        continue;
      }

      const parsed = parseJsonValue(row.value);
      const usage = extractCursorBubbleUsage(parsed, row.key, composerModels, store);
      if (!usage) {
        continue;
      }

      if (options?.since && usage.timestamp) {
        const timestamp = new Date(usage.timestamp);
        if (Number.isFinite(timestamp.getTime()) && timestamp < options.since) {
          continue;
        }
      }

      if (seen.has(usage.recordHash)) {
        continue;
      }
      seen.add(usage.recordHash);

      yield usage;
    } catch {
      options?.onFileSkipped?.(store.path, "malformed");
    }
  }
}

function readStateRows(db: SqliteDatabase): StateRow[] {
  const rows: StateRow[] = [];

  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
      name: unknown;
    }[];
    const availableTables = new Set(tables.flatMap((table) => stringValue(table.name) ?? []));

    for (const table of STATE_TABLES) {
      if (!availableTables.has(table)) {
        continue;
      }

      const columns = db.prepare(`PRAGMA table_info("${table}")`).all() as { name: unknown }[];
      const columnNames = new Set(columns.flatMap((column) => stringValue(column.name) ?? []));
      if (!columnNames.has("key") || !columnNames.has("value")) {
        continue;
      }

      const tableRows = db.prepare(`SELECT key, value FROM "${table}"`).all() as {
        key: unknown;
        value: unknown;
      }[];
      rows.push(
        ...tableRows.flatMap((row) =>
          typeof row.key === "string" ? [{ key: row.key, value: row.value }] : [],
        ),
      );
    }
  } catch {
    return rows;
  }

  return rows;
}

function parseJsonValue(value: unknown): unknown | undefined {
  const raw = decodeStateValue(value);
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "string") {
      return parsed;
    }

    const trimmed = parsed.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return parsed;
    }

    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

function decodeStateValue(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString("utf-8");
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("utf-8");
  }
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("utf-8");
  }
  return null;
}

function collectComposerModels(rows: StateRow[]): Map<string, string> {
  const models = new Map<string, string>();

  for (const row of rows) {
    if (!row.key.startsWith("composerData:")) {
      continue;
    }

    const parsed = parseJsonValue(row.value);
    const record = asRecord(parsed);
    if (!record) {
      continue;
    }

    const composerId = stringValue(record["composerId"]) ?? row.key.slice("composerData:".length);
    const model = extractCursorModel(record);
    if (composerId && model) {
      models.set(composerId, model);
    }
  }

  return models;
}

function extractCursorBubbleUsage(
  root: unknown,
  rowKey: string,
  composerModels: Map<string, string>,
  store: CursorStateStore,
): UsageRecord | null {
  const record = asRecord(root);
  if (!record || numberValue(record["type"]) !== 2) {
    return null;
  }

  const tokenCount = asRecord(record["tokenCount"]);
  if (!tokenCount) {
    return null;
  }

  const inputTokens = numberValue(tokenCount["inputTokens"] ?? tokenCount["input"]);
  const outputTokens = numberValue(tokenCount["outputTokens"] ?? tokenCount["output"]);
  const cacheReadTokens = numberValue(tokenCount["cacheReadTokens"] ?? tokenCount["cacheRead"]);
  const cacheWriteTokens = numberValue(tokenCount["cacheWriteTokens"] ?? tokenCount["cacheWrite"]);
  const reasoningTokens = numberValue(tokenCount["reasoningTokens"] ?? tokenCount["reasoning"]);
  if (inputTokens + outputTokens + reasoningTokens + cacheReadTokens + cacheWriteTokens === 0) {
    return null;
  }

  const composerId = cursorBubbleSession(rowKey);
  const model = extractCursorModel(record) ?? (composerId ? composerModels.get(composerId) : undefined);
  const timestamp = extractTimestamp(record);

  return withRecordHash({
    agent: "cursor",
    model,
    timestamp,
    session: composerId ?? extractSession(record),
    project: store.project,
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheReadTokens,
    cacheWriteTokens,
    sourceFile: store.path,
    nativeId: `${store.scope}:${rowKey}`,
  });
}

function extractCursorModel(record: Record<string, unknown>): string | undefined {
  const direct = firstStringField(record, ["model", "modelName", "modelId"]);
  if (direct) {
    return direct;
  }

  for (const field of ["modelInfo", "modelConfig"]) {
    const modelRecord = asRecord(record[field]);
    if (!modelRecord) {
      continue;
    }

    const nested = firstStringField(modelRecord, ["modelName", "modelId", "id", "name"]);
    if (nested && nested !== "default") {
      return nested;
    }

    const selected = modelRecord["selectedModels"];
    if (Array.isArray(selected)) {
      for (const item of selected) {
        const itemRecord = asRecord(item);
        const selectedModel = itemRecord
          ? firstStringField(itemRecord, ["modelId", "modelName", "id", "name"])
          : undefined;
        if (selectedModel && selectedModel !== "default") {
          return selectedModel;
        }
      }
    }
  }

  return undefined;
}

function cursorBubbleSession(rowKey: string): string | undefined {
  const [, composerId] = rowKey.split(":");
  return composerId?.trim() || undefined;
}

function firstStringField(record: Record<string, unknown>, fields: string[]): string | undefined {
  for (const field of fields) {
    const value = stringValue(record[field]);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function extractTimestamp(record: Record<string, unknown>): string | undefined {
  for (const field of ["timestamp", "createdAt", "updatedAt", "time", "created", "date", "ts"]) {
    const timestamp = normalizeTimestamp(record[field]);
    if (timestamp) {
      return timestamp;
    }
  }

  return undefined;
}

function extractSession(record: Record<string, unknown>): string | undefined {
  for (const field of ["conversationId", "composerId", "sessionId", "chatId", "threadId", "id"]) {
    const value = stringValue(record[field]);
    if (value) {
      return value;
    }
  }

  return undefined;
}
