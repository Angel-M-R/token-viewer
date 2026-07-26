import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { ampThreadsDir, type Adapter, type UsageOptions, type UsageRecord } from "@tokenviewer/core";
import { readJsonFileWithCursor } from "./source-files.js";
import { asRecord, isAtOrAfter, numberValue, stringValue, withRecordHash } from "./utils.js";

interface AmpUsageContext {
  provider?: string;
  model?: string;
  timestamp?: string;
}

export function ampAdapter(): Adapter {
  return {
    name: "amp",
    async detect(): Promise<boolean> {
      return Boolean(await stat(ampThreadsDir()).catch(() => null));
    },
    async *usage(options?: UsageOptions): AsyncGenerator<UsageRecord> {
      const threadsDir = ampThreadsDir();
      const files = await readdir(threadsDir).catch(() => []);

      for (const file of files.filter((entry) => entry.endsWith(".json"))) {
        const filePath = join(threadsDir, file);
        const threadId = file.replace(/\.json$/, "");
        const parsed = await readJsonFileWithCursor(filePath, options);
        const thread = asRecord(parsed);
        if (!thread?.["usageLedger"]) {
          continue;
        }

        const records = extractAmpUsageRecords(thread["usageLedger"], threadId, filePath);
        for (const record of records) {
          if (isAtOrAfter(record.timestamp, options?.since)) {
            yield record;
          }
        }
      }
    },
  };
}

function extractAmpUsageRecords(
  usageLedger: unknown,
  threadId: string,
  sourceFile: string,
): UsageRecord[] {
  const records: UsageRecord[] = [];
  collectAmpUsage(usageLedger, threadId, sourceFile, records, {});
  return records;
}

function collectAmpUsage(
  value: unknown,
  threadId: string,
  sourceFile: string,
  records: UsageRecord[],
  context: AmpUsageContext,
  depth = 0,
): void {
  if (depth > 12) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectAmpUsage(item, threadId, sourceFile, records, context, depth + 1);
    }
    return;
  }

  const record = asRecord(value);
  if (!record) {
    return;
  }

  const nextContext = {
    provider: stringField(record, ["provider", "providerID", "providerId"]) ?? context.provider,
    model: stringField(record, ["model", "modelID", "modelId"]) ?? context.model,
    timestamp: timestampField(record) ?? context.timestamp,
  };
  const usageSource = firstRecordField(record, ["usage", "tokens", "tokenUsage"]) ?? record;
  const rawInputTokens = tokenField(usageSource, ["inputTokens", "input_tokens", "promptTokens"]);
  const outputTokens = tokenField(usageSource, ["outputTokens", "output_tokens", "completionTokens"]);
  const reasoningTokens = tokenField(usageSource, ["reasoningTokens", "reasoning_output_tokens"]);
  const cachedInputSubset = tokenField(usageSource, ["cachedInputTokens", "cached_input_tokens"]);
  const cacheReadTokens = tokenField(usageSource, [
    "cacheReadTokens",
    "cache_read_tokens",
    "cacheReadInputTokens",
    "cache_read_input_tokens",
    "cachedInputTokens",
    "cached_input_tokens",
  ]);
  const inputTokens = Math.max(rawInputTokens - cachedInputSubset, 0);
  const cacheWriteTokens = tokenField(usageSource, [
    "cacheWriteTokens",
    "cache_write_tokens",
    "cacheCreationInputTokens",
    "cache_creation_input_tokens",
    "cacheWriteInputTokens",
    "cache_write_input_tokens",
  ]);
  const billedCost = tokenField(record, [
    "cost",
    "totalCost",
    "total_cost",
    "billedCost",
    "billed_cost",
  ]);

  if (
    inputTokens + outputTokens + reasoningTokens + cacheReadTokens + cacheWriteTokens + billedCost >
    0
  ) {
    records.push(
      withRecordHash({
        agent: "amp",
        provider: nextContext.provider,
        model: nextContext.model,
        timestamp: nextContext.timestamp,
        session: threadId,
        billedCost,
        inputTokens,
        outputTokens,
        reasoningTokens,
        cacheReadTokens,
        cacheWriteTokens,
        sourceFile,
        nativeId: `${threadId}:${records.length}`,
      }),
    );
  }

  for (const child of Object.values(record)) {
    if (child !== usageSource && typeof child === "object" && child !== null) {
      collectAmpUsage(child, threadId, sourceFile, records, nextContext, depth + 1);
    }
  }
}

function firstRecordField(
  record: Record<string, unknown>,
  fields: string[],
): Record<string, unknown> | null {
  for (const field of fields) {
    const value = asRecord(record[field]);
    if (value) {
      return value;
    }
  }

  return null;
}

function stringField(record: Record<string, unknown>, fields: string[]): string | undefined {
  for (const field of fields) {
    const value = stringValue(record[field]);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function timestampField(record: Record<string, unknown>): string | undefined {
  const value = stringField(record, ["timestamp", "createdAt", "time", "date"]);
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function tokenField(record: Record<string, unknown>, fields: string[]): number {
  for (const field of fields) {
    const value = numberValue(record[field]);
    if (value > 0) {
      return value;
    }
  }

  return 0;
}
