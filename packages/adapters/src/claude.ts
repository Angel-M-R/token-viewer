import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  claudeProjectsDir,
  type Adapter,
  type UsageOptions,
  type UsageRecord,
} from "@tokenviewer/core";
import { readCompleteJsonlLines } from "./source-files.js";
import {
  asRecord,
  isAtOrAfter,
  numberValue,
  stringValue,
  withRecordHash,
} from "./utils.js";

interface ClaudeFile {
  filePath: string;
  session: string;
  project: string;
}

export function claudeAdapter(): Adapter {
  return {
    name: "claude",
    async detect(): Promise<boolean> {
      return Boolean(await stat(claudeProjectsDir()).catch(() => null));
    },
    async *usage(options?: UsageOptions): AsyncGenerator<UsageRecord> {
      for await (const file of discoverClaudeJsonlFiles()) {
        yield* parseClaudeUsageJsonl(file, options);
      }
    },
  };
}

async function* discoverClaudeJsonlFiles(): AsyncGenerator<ClaudeFile> {
  const root = claudeProjectsDir();
  const projectDirs = await readdir(root).catch(() => []);

  for (const projectDir of projectDirs) {
    const projectPath = join(root, projectDir);
    const projectStat = await stat(projectPath).catch(() => null);
    if (!projectStat?.isDirectory()) {
      continue;
    }

    const entries = await readdir(projectPath).catch(() => []);
    for (const entry of entries) {
      const entryPath = join(projectPath, entry);
      const entryStat = await stat(entryPath).catch(() => null);
      if (entryStat?.isFile() && entry.endsWith(".jsonl")) {
        yield {
          filePath: entryPath,
          session: entry.replace(/\.jsonl$/, ""),
          project: projectDir,
        };
      }

      if (entryStat?.isDirectory()) {
        const subagentsDir = join(entryPath, "subagents");
        const subagentFiles = await readdir(subagentsDir).catch(() => []);
        for (const subagentFile of subagentFiles.filter((file) => file.endsWith(".jsonl"))) {
          yield {
            filePath: join(subagentsDir, subagentFile),
            session: `${entry}/${subagentFile.replace(/\.jsonl$/, "")}`,
            project: projectDir,
          };
        }
      }
    }
  }
}

async function* parseClaudeUsageJsonl(
  file: ClaudeFile,
  options?: UsageOptions,
): AsyncGenerator<UsageRecord> {
  const lines = await readCompleteJsonlLines(file.filePath, options);
  const byRequest = new Map<string, UsageRecord>();

  for (const { line, lineNumber } of lines) {
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      const message = asRecord(entry["message"]);
      if (!message || entry["type"] !== "assistant" || message["role"] !== "assistant") {
        continue;
      }

      const usage = asRecord(message["usage"]);
      if (!usage) {
        continue;
      }

      const timestamp = extractTimestamp(entry);
      if (!isAtOrAfter(timestamp, options?.since)) {
        continue;
      }

      const inputTokens = numberValue(usage["input_tokens"]);
      const outputTokens = numberValue(usage["output_tokens"]);
      const cacheReadTokens = numberValue(usage["cache_read_input_tokens"]);
      const cacheWriteTokens = cacheCreationTokens(usage);
      if (inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens === 0) {
        continue;
      }

      const nativeId =
        stringValue(message["id"]) && stringValue(entry["requestId"])
          ? `${stringValue(message["id"])}:${stringValue(entry["requestId"])}`
          : stringValue(entry["requestId"]) ??
            stringValue(message["id"]) ??
            `${file.session}:${lineNumber}`;

      byRequest.set(
        nativeId,
        withRecordHash({
          agent: "claude",
          provider: "anthropic",
          model: stringValue(message["model"]),
          timestamp,
          session: file.session,
          project: file.project,
          inputTokens,
          outputTokens,
          reasoningTokens: 0,
          cacheReadTokens,
          cacheWriteTokens,
          sourceFile: file.filePath,
          nativeId,
        }),
      );
    } catch {
      options?.onFileSkipped?.(file.filePath, "malformed");
    }
  }

  for (const record of byRequest.values()) {
    yield record;
  }
}

function extractTimestamp(entry: Record<string, unknown>): string | undefined {
  return stringValue(entry["timestamp"]) ?? stringValue(entry["createdAt"]);
}

function cacheCreationTokens(usage: Record<string, unknown>): number {
  const explicit = numberValue(usage["cache_creation_input_tokens"]);
  if (explicit > 0) {
    return explicit;
  }

  const cacheCreation = asRecord(usage["cache_creation"]);
  return (
    numberValue(cacheCreation?.["ephemeral_1h_input_tokens"]) +
    numberValue(cacheCreation?.["ephemeral_5m_input_tokens"])
  );
}
