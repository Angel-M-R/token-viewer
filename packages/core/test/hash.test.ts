import { describe, expect, it } from "vitest";
import { computeRecordHash, type HashableUsageRecord } from "../src/index.js";

describe("computeRecordHash", () => {
  it("is stable for the same record between executions", () => {
    const record: HashableUsageRecord = {
      agent: "claude",
      provider: "anthropic",
      model: "claude-sonnet-4",
      timestamp: "2026-07-05T10:00:00.000Z",
      session: "session-1",
      project: "project-a",
      sourceFile: "/tmp/claude/session.jsonl",
      nativeId: "message-1:request-1",
      inputTokens: 10,
      outputTokens: 20,
      reasoningTokens: 0,
      cacheReadTokens: 5,
      cacheWriteTokens: 3,
    };

    expect(computeRecordHash(record)).toBe(computeRecordHash({ ...record }));
  });

  it("changes when stable token fields change", () => {
    const base: HashableUsageRecord = {
      agent: "codex",
      sourceFile: "/tmp/codex/rollout.jsonl",
      inputTokens: 1,
      outputTokens: 2,
      reasoningTokens: 3,
      cacheReadTokens: 4,
      cacheWriteTokens: 5,
    };

    expect(computeRecordHash(base)).not.toBe(computeRecordHash({ ...base, outputTokens: 8 }));
  });
});
