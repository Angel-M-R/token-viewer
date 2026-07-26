import { stat } from "node:fs/promises";
import { basename } from "node:path";
import {
  codexRoots,
  type Adapter,
  type UsageOptions,
  type UsageRecord,
} from "@tokenviewer/core";
import { readCompleteJsonlLines, walkFiles } from "./source-files.js";
import {
  asRecord,
  isAtOrAfter,
  numberValue,
  stringValue,
  withRecordHash,
} from "./utils.js";

interface CodexTokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
}

export function codexAdapter(): Adapter {
  return {
    name: "codex",
    async detect(): Promise<boolean> {
      for (const root of codexRoots()) {
        if (await stat(root).catch(() => null)) {
          return true;
        }
      }
      return false;
    },
    async *usage(options?: UsageOptions): AsyncGenerator<UsageRecord> {
      const seenUsage = new Set<string>();
      for await (const filePath of discoverCodexSessionFiles()) {
        for await (const record of parseCodexUsageJsonl(filePath, options)) {
          if (seenUsage.has(record.recordHash)) {
            continue;
          }
          seenUsage.add(record.recordHash);
          yield record;
        }
      }
    },
  };
}

async function* discoverCodexSessionFiles(): AsyncGenerator<string> {
  for (const root of codexRoots()) {
    yield* walkFiles(root, (fileName) => fileName.endsWith(".jsonl"));
  }
}

async function* parseCodexUsageJsonl(
  filePath: string,
  options?: UsageOptions,
): AsyncGenerator<UsageRecord> {
  const lines = await readCompleteJsonlLines(filePath, options);
  let model: string | undefined;
  let previousTotal: CodexTokenUsage | null = null;
  let previousUsageSignature: string | null = null;
  let session = sessionFromRolloutFileName(basename(filePath));
  let sawSessionMeta = false;

  for (const { line, lineNumber } of lines) {
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      const payload = asRecord(entry["payload"]);

      if (entry["type"] === "session_meta") {
        const metaSession = stringValue(payload?.["id"]) ?? stringValue(entry["id"]);
        if (metaSession && !sawSessionMeta) {
          session = metaSession;
          sawSessionMeta = true;
        }
        continue;
      }

      if (entry["type"] === "turn_context") {
        model = stringValue(payload?.["model"]) ?? model;
        continue;
      }

      if (entry["type"] !== "event_msg" || payload?.["type"] !== "token_count") {
        continue;
      }

      const info = asRecord(payload["info"]);
      if (!info) {
        continue;
      }

      const lastUsageValue = info["last_token_usage"];
      const lastUsage = parseCodexTokenUsage(lastUsageValue);
      const total = parseCodexTokenUsage(info["total_token_usage"]);
      let usage: CodexTokenUsage | null = null;

      if (lastUsageValue !== undefined) {
        if (lastUsage && hasBillableUsage(lastUsage)) {
          const signature = codexUsageSignature(lastUsage, total);
          if (signature !== previousUsageSignature) {
            usage = lastUsage;
          }
          previousUsageSignature = signature;
        }
      } else if (total) {
        const delta = previousTotal ? subtractCodexUsage(total, previousTotal) : total;
        if (hasBillableUsage(delta)) {
          usage = delta;
        }
      }
      if (total && hasBillableUsage(total)) {
        previousTotal = total;
      }
      if (!usage) {
        continue;
      }

      const timestamp = stringValue(entry["timestamp"]);
      if (!isAtOrAfter(timestamp, options?.since)) {
        continue;
      }

      const reasoningTokens = Math.min(usage.reasoningOutputTokens, usage.outputTokens);
      const nativeId = `${session}:${timestamp ?? ""}:${lineNumber}:${codexUsageSignature(usage, total)}`;
      yield withRecordHash({
        agent: "codex",
        provider: "openai",
        model,
        timestamp,
        session,
        inputTokens: Math.max(usage.inputTokens - usage.cachedInputTokens, 0),
        outputTokens: Math.max(usage.outputTokens - reasoningTokens, 0),
        reasoningTokens,
        cacheReadTokens: usage.cachedInputTokens,
        cacheWriteTokens: 0,
        sourceFile: filePath,
        nativeId,
      });
    } catch {
      options?.onFileSkipped?.(filePath, "malformed");
    }
  }
}

function sessionFromRolloutFileName(fileName: string): string {
  return (
    fileName.match(
      /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i,
    )?.[1] ?? fileName.replace(/\.jsonl$/, "")
  );
}

function parseCodexTokenUsage(value: unknown): CodexTokenUsage | null {
  const usage = asRecord(value);
  if (!usage) {
    return null;
  }

  const hasUsageField = [
    "input_tokens",
    "cached_input_tokens",
    "output_tokens",
    "reasoning_output_tokens",
    "total_tokens",
  ].some((key) => typeof usage[key] === "number" && Number.isFinite(usage[key]));
  if (!hasUsageField) {
    return null;
  }

  return {
    inputTokens: numberValue(usage["input_tokens"]),
    cachedInputTokens: numberValue(usage["cached_input_tokens"]),
    outputTokens: numberValue(usage["output_tokens"]),
    reasoningOutputTokens: numberValue(usage["reasoning_output_tokens"]),
    totalTokens: numberValue(usage["total_tokens"]),
  };
}

function subtractCodexUsage(current: CodexTokenUsage, previous: CodexTokenUsage): CodexTokenUsage {
  return {
    inputTokens: Math.max(current.inputTokens - previous.inputTokens, 0),
    cachedInputTokens: Math.max(current.cachedInputTokens - previous.cachedInputTokens, 0),
    outputTokens: Math.max(current.outputTokens - previous.outputTokens, 0),
    reasoningOutputTokens: Math.max(current.reasoningOutputTokens - previous.reasoningOutputTokens, 0),
    totalTokens: Math.max(current.totalTokens - previous.totalTokens, 0),
  };
}

function hasBillableUsage(usage: CodexTokenUsage): boolean {
  return (
    usage.inputTokens + usage.cachedInputTokens + usage.outputTokens + usage.reasoningOutputTokens >
    0
  );
}

function codexUsageSignature(usage: CodexTokenUsage, total: CodexTokenUsage | null): string {
  return [
    usage.inputTokens,
    usage.cachedInputTokens,
    usage.outputTokens,
    usage.reasoningOutputTokens,
    total?.inputTokens ?? "",
    total?.cachedInputTokens ?? "",
    total?.outputTokens ?? "",
    total?.reasoningOutputTokens ?? "",
  ].join(":");
}
