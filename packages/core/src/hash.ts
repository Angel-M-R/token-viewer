import { createHash } from "node:crypto";
import type { HashableUsageRecord } from "./types.js";

const HASH_FIELDS = [
  "agent",
  "sourceFile",
  "nativeId",
  "provider",
  "model",
  "timestamp",
  "session",
  "project",
  "billedCost",
  "inputTokens",
  "outputTokens",
  "reasoningTokens",
  "cacheReadTokens",
  "cacheWriteTokens",
] as const;

export function computeRecordHash(record: HashableUsageRecord): string {
  const stable: Record<string, unknown> = {};

  for (const field of HASH_FIELDS) {
    const value = record[field as keyof HashableUsageRecord];
    if (value !== undefined) {
      stable[field] = value;
    }
  }

  return createHash("sha256").update(stableStringify(stable)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}
