import { describe, expect, it } from "vitest";
import { ingestPayloadSchema, quotaIngestRequestSchema, quotaSnapshotSchema } from "../src/index.js";

describe("ingestPayloadSchema", () => {
  it("limits batches to 1000 records", () => {
    const record = {
      agent: "claude",
      inputTokens: 1,
      outputTokens: 1,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      sourceFile: "/tmp/a.jsonl",
      recordHash: "a".repeat(64),
    };

    const parsed = ingestPayloadSchema.safeParse({
      machineName: "machine",
      machineToken: "token",
      records: Array.from({ length: 1001 }, () => record),
    });

    expect(parsed.success).toBe(false);
  });
});

describe("quota schemas", () => {
  it("accepts a complete quota snapshot", () => {
    const parsed = quotaSnapshotSchema.parse({
      provider: "copilot",
      takenAt: "2026-07-05T10:00:00.000Z",
      percentUsed: 42.5,
      plan: "Pro",
      resetsAt: "2026-08-01T00:00:00.000Z",
      raw: { login: "octocat" },
    });

    expect(parsed.provider).toBe("copilot");
  });

  it("accepts absent optional quota fields", () => {
    expect(
      quotaSnapshotSchema.safeParse({
        provider: "copilot",
        takenAt: "2026-07-05T10:00:00.000Z",
        raw: { login: "octocat" },
      }).success,
    ).toBe(true);
  });

  it("rejects invalid quota ingest bodies", () => {
    expect(
      quotaIngestRequestSchema.safeParse({
        snapshot: {
          takenAt: "2026-07-05T10:00:00.000Z",
          raw: {},
        },
      }).success,
    ).toBe(false);
  });
});
