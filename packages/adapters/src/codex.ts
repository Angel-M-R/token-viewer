import { stat } from "node:fs/promises";
import { basename } from "node:path";
import {
  codexRoots,
  type Adapter,
  type HashableUsageRecord,
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

interface CanonicalCodexUsage {
  responseId: string;
  turnId: string;
  session?: string;
  timestamp: string;
  usage: CodexTokenUsage;
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
      const seenResponses = new Set<string>();
      for await (const filePath of discoverCodexSessionFiles()) {
        for await (const record of parseCodexUsageJsonl(filePath, seenResponses, options)) {
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
  seenResponses: Set<string>,
  options?: UsageOptions,
): AsyncGenerator<UsageRecord> {
  const appendedLines = await readCompleteJsonlLines(filePath, options);
  const firstNewLine = appendedLines[0]?.lineNumber;
  if (firstNewLine === undefined) return;
  // Incremental reads still need earlier context and response mirrors to interpret
  // an appended counter correctly. Only newly appended records are emitted below.
  const lines = firstNewLine > 1
    ? await readCompleteJsonlLines(filePath, { full: true })
    : appendedLines;
  const canonicalMirrors = findCanonicalMirrors(lines);
  let model: string | undefined;
  let contextIndex = 0;
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
        contextIndex += 1;
        continue;
      }

      if (entry["type"] === "token_usage_record") {
        const canonical = parseCanonicalUsage(entry);
        if (!canonical) {
          const usage = parseCodexTokenUsage(payload?.["usage"]);
          if (!usage || hasBillableUsage(usage)) {
            options?.onWarning?.("codex: unsupported token_usage_record; retaining legacy counter fallback");
          }
          continue;
        }
        if (!isAtOrAfter(canonical.timestamp, options?.since) || seenResponses.has(canonical.responseId)) {
          continue;
        }
        seenResponses.add(canonical.responseId);
        if (lineNumber < firstNewLine) continue;
        yield codexUsageRecord(canonical.usage, {
          model,
          timestamp: canonical.timestamp,
          session: canonical.session ?? session,
          sourceFile: filePath,
          nativeId: `response:${canonical.responseId}`,
        });
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
      const mirror = canonicalMirrors.get(mirrorKey(contextIndex, usage))?.shift();
      if (mirror) {
        // A legacy-first response may already have been counted in an earlier
        // incremental scan before its canonical record was appended.
        if (lineNumber < firstNewLine && isAtOrAfter(timestamp, options?.since)) {
          seenResponses.add(mirror.responseId);
        }
        continue;
      }
      if (lineNumber < firstNewLine) continue;
      if (!isAtOrAfter(timestamp, options?.since)) {
        continue;
      }

      const nativeId = `${session}:${timestamp ?? ""}:${lineNumber}:${codexUsageSignature(usage, total)}`;
      yield codexUsageRecord(usage, {
        model,
        timestamp,
        session,
        sourceFile: filePath,
        nativeId,
      });
    } catch {
      options?.onFileSkipped?.(filePath, "malformed");
    }
  }
}

// Suppress one matching legacy response per canonical record, rather than an entire
// turn. Missing or malformed canonical responses must leave legacy usage recoverable.
// Context boundaries separate responses even when older contexts have no turn_id.
function findCanonicalMirrors(lines: readonly { line: string }[]): Map<string, CanonicalCodexUsage[]> {
  const mirrors = new Map<string, CanonicalCodexUsage[]>();
  let contextIndex = 0;
  for (const { line } of lines) {
    if (!line.includes("token_usage_record") && !line.includes("turn_context")) continue;
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      if (entry["type"] === "turn_context") contextIndex += 1;
      const canonical = parseCanonicalUsage(entry);
      if (canonical) {
        const key = mirrorKey(contextIndex, canonical.usage);
        const responses = mirrors.get(key) ?? [];
        responses.push(canonical);
        mirrors.set(key, responses);
      }
    } catch {
      // The main pass reports malformed JSON once.
    }
  }
  return mirrors;
}

function mirrorKey(contextIndex: number, usage: CodexTokenUsage): string {
  return `${contextIndex}:${codexUsageSignature(usage, null)}`;
}

function parseCanonicalUsage(entry: Record<string, unknown>): CanonicalCodexUsage | null {
  if (entry["type"] !== "token_usage_record") return null;
  const payload = asRecord(entry["payload"]);
  const usage = parseCodexTokenUsage(payload?.["usage"]);
  const responseId = stringValue(payload?.["response_id"]);
  const turnId = stringValue(payload?.["turn_id"]);
  const timestamp = stringValue(entry["timestamp"]);
  if (!usage || !hasBillableUsage(usage) || !responseId || !turnId || !timestamp || !Number.isFinite(Date.parse(timestamp))) {
    return null;
  }
  return {
    usage, responseId, turnId, timestamp,
    session: stringValue(payload?.["thread_id"]) ?? stringValue(payload?.["session_id"]),
  };
}

function codexUsageRecord(
  usage: CodexTokenUsage,
  source: Pick<HashableUsageRecord, "model" | "timestamp" | "session" | "sourceFile" | "nativeId">,
): UsageRecord {
  const reasoningTokens = Math.min(usage.reasoningOutputTokens, usage.outputTokens);
  return withRecordHash({
    agent: "codex",
    provider: "openai",
    ...source,
    inputTokens: Math.max(usage.inputTokens - usage.cachedInputTokens, 0),
    outputTokens: Math.max(usage.outputTokens - reasoningTokens, 0),
    reasoningTokens,
    cacheReadTokens: usage.cachedInputTokens,
    cacheWriteTokens: 0,
  });
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
