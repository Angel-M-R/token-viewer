import {
  type DailySnapshot,
  type SnapshotSourceFile,
  UNKNOWN_DIMENSION,
} from "../../src/index.js";

export const angelSnapshot: DailySnapshot = {
  schemaVersion: 1,
  machine: "angel-mac",
  date: "2026-07-26",
  generatedAt: "2026-07-27T00:05:00.000Z",
  usage: [
    {
      hour: "2026-07-26T08:00:00.000Z",
      agent: "claude",
      provider: "anthropic",
      model: "claude-sonnet-4",
      requests: 2,
      inputTokens: 100,
      outputTokens: 20,
      reasoningTokens: 4,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
      estimatedCost: 0.001,
      billedCost: 0,
      unpricedRequests: 0,
    },
    {
      hour: "2026-07-26T09:00:00.000Z",
      agent: "codex",
      provider: "openai",
      model: "gpt-5",
      requests: 1,
      inputTokens: 50,
      outputTokens: 10,
      reasoningTokens: 2,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      estimatedCost: 0.002,
      billedCost: 0.003,
      unpricedRequests: 0,
    },
  ],
  quotaSamples: [
    {
      provider: "copilot",
      takenAt: "2026-07-26T08:30:00.000Z",
      percentUsed: 25,
      plan: "Pro",
      resetsAt: "2026-08-01T00:00:00.000Z",
    },
    {
      provider: "copilot",
      takenAt: "2026-07-26T09:30:00.000Z",
      percentUsed: 30,
      plan: "Pro",
      resetsAt: "2026-08-01T00:00:00.000Z",
    },
  ],
  totals: {
    requests: 3,
    inputTokens: 150,
    outputTokens: 30,
    reasoningTokens: 6,
    cacheReadTokens: 10,
    cacheWriteTokens: 5,
    estimatedCost: 0.003,
    billedCost: 0.003,
    unpricedRequests: 0,
  },
};

export const aonSnapshot: DailySnapshot = {
  schemaVersion: 1,
  machine: "old-mac",
  date: "2026-07-26",
  generatedAt: "2026-07-27T00:06:00.000Z",
  usage: [
    {
      hour: "2026-07-26T10:00:00.000Z",
      agent: "cursor",
      provider: UNKNOWN_DIMENSION,
      model: UNKNOWN_DIMENSION,
      requests: 1,
      inputTokens: 5,
      outputTokens: 1,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      estimatedCost: 0,
      billedCost: 0,
      unpricedRequests: 1,
    },
  ],
  quotaSamples: [],
  totals: {
    requests: 1,
    inputTokens: 5,
    outputTokens: 1,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    estimatedCost: 0,
    billedCost: 0,
    unpricedRequests: 1,
  },
};

export const aonM5Snapshot: DailySnapshot = {
  schemaVersion: 1,
  machine: "mac-m5",
  date: "2026-07-26",
  generatedAt: "2026-07-27T00:07:00.000Z",
  usage: [
    {
      hour: "2026-07-26T11:00:00.000Z",
      agent: "codex",
      provider: "openai",
      model: "gpt-5",
      requests: 1,
      inputTokens: 8,
      outputTokens: 2,
      reasoningTokens: 1,
      cacheReadTokens: 3,
      cacheWriteTokens: 0,
      estimatedCost: 0.004,
      billedCost: 0,
      unpricedRequests: 0,
    },
  ],
  quotaSamples: [],
  totals: {
    requests: 1,
    inputTokens: 8,
    outputTokens: 2,
    reasoningTokens: 1,
    cacheReadTokens: 3,
    cacheWriteTokens: 0,
    estimatedCost: 0.004,
    billedCost: 0,
    unpricedRequests: 0,
  },
};

export function validSnapshotFiles(): SnapshotSourceFile[] {
  return [
    {
      path: "snapshots/angel-mac/2026/07/2026-07-26.json",
      value: structuredClone(angelSnapshot),
    },
    {
      path: "snapshots/old-mac/2026/07/2026-07-26.json",
      value: structuredClone(aonSnapshot),
    },
    {
      path: "snapshots/mac-m5/2026/07/2026-07-26.json",
      value: structuredClone(aonM5Snapshot),
    },
  ];
}
