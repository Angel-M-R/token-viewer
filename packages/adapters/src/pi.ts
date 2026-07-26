import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { piSessionsDir, type Adapter, type UsageOptions, type UsageRecord } from "@tokenviewer/core";
import { readCompleteJsonlLines, walkFiles } from "./source-files.js";
import { asRecord, isAtOrAfter, numberValue, stringValue, withRecordHash } from "./utils.js";

export function piAdapter(): Adapter {
  return {
    name: "pi",
    async detect(): Promise<boolean> {
      return Boolean(await stat(piSessionsDir()).catch(() => null));
    },
    async *usage(options?: UsageOptions): AsyncGenerator<UsageRecord> {
      for await (const filePath of walkFiles(piSessionsDir(), (file) => file.endsWith(".jsonl"))) {
        yield* parsePiUsageJsonl(filePath, options);
      }
    },
  };
}

async function* parsePiUsageJsonl(
  filePath: string,
  options?: UsageOptions,
): AsyncGenerator<UsageRecord> {
  const lines = await readCompleteJsonlLines(filePath, options);
  const session = basename(filePath).replace(/\.jsonl$/, "");
  let project: string | undefined;

  for (const { line, lineNumber } of lines) {
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      if (entry["type"] === "session") {
        project = stringValue(entry["cwd"]) ?? project;
        continue;
      }

      if (entry["type"] !== "message") {
        continue;
      }

      const message = asRecord(entry["message"]);
      if (!message || message["role"] !== "assistant") {
        continue;
      }

      const usage = asRecord(message["usage"]);
      if (!usage) {
        continue;
      }

      const inputTokens = numberValue(usage["input"]);
      const outputTokens = numberValue(usage["output"]);
      const cacheReadTokens = numberValue(usage["cacheRead"]);
      const cacheWriteTokens = numberValue(usage["cacheWrite"]);
      if (inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens === 0) {
        continue;
      }

      const timestamp =
        stringValue(entry["timestamp"]) ??
        (typeof message["timestamp"] === "number"
          ? new Date(message["timestamp"]).toISOString()
          : undefined);
      if (!isAtOrAfter(timestamp, options?.since)) {
        continue;
      }

      const responseModel = stringValue(message["responseModel"]);
      yield withRecordHash({
        agent: "pi",
        provider: responseModel?.includes("/") ? undefined : stringValue(message["provider"]),
        model: responseModel ?? stringValue(message["model"]),
        timestamp,
        session,
        project,
        inputTokens,
        outputTokens,
        reasoningTokens: 0,
        cacheReadTokens,
        cacheWriteTokens,
        sourceFile: filePath,
        nativeId: `${session}:${lineNumber}`,
      });
    } catch {
      options?.onFileSkipped?.(filePath, "malformed");
    }
  }
}
