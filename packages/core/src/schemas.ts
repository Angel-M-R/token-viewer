import { z } from "zod";
import { ADAPTER_NAMES } from "./types.js";

export const usageRecordSchema = z.object({
  agent: z.enum(ADAPTER_NAMES).or(z.string().min(1)),
  provider: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  timestamp: z.string().datetime({ offset: true }).optional(),
  session: z.string().min(1).optional(),
  project: z.string().min(1).optional(),
  billedCost: z.number().finite().nonnegative().optional(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  sourceFile: z.string().min(1),
  recordHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export const ingestPayloadSchema = z.object({
  machineName: z.string().min(1),
  machineToken: z.string().min(1),
  records: z.array(usageRecordSchema).max(1000),
});

export const ingestRequestSchema = z.object({
  records: z.array(usageRecordSchema).max(1000),
});

export const ingestResponseSchema = z.object({
  accepted: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
});

export const machineRegisterRequestSchema = z.object({
  name: z.string().min(1),
  os: z.string().min(1).optional(),
});

export const machineRegisterResponseSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  os: z.string().min(1).optional(),
  machineToken: z.string().regex(/^tv_[a-f0-9]{64}$/),
});

export const machineListItemSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  os: z.string().nullable(),
  createdAt: z.string(),
  lastSeenAt: z.string().nullable(),
  requests: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
});

export const statsSummaryResponseSchema = z.object({
  requests: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  estimatedCost: z.number().nonnegative(),
  billedCost: z.number().nonnegative(),
  unpricedRequests: z.number().int().nonnegative(),
  modelCount: z.number().int().nonnegative(),
});

export const statsDailyResponseSchema = z.object({
  groupBy: z.enum(["none", "agent", "model", "machine"]),
  rows: z.array(
    z.object({
      day: z.string(),
      group: z.string().nullable(),
      requests: z.number().int().nonnegative(),
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
      reasoningTokens: z.number().int().nonnegative(),
      cacheReadTokens: z.number().int().nonnegative(),
      cacheWriteTokens: z.number().int().nonnegative(),
      estimatedCost: z.number().nonnegative(),
      billedCost: z.number().nonnegative(),
    }),
  ),
});

export const statsHeatmapResponseSchema = z.object({
  metric: z.enum(["tokens", "cost", "requests"]),
  tz: z.string(),
  matrix: z.array(z.array(z.number())).length(7),
});

export const statsModelsResponseSchema = z.object({
  rows: z.array(
    z.object({
      provider: z.string().nullable(),
      model: z.string().nullable(),
      requests: z.number().int().nonnegative(),
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
      reasoningTokens: z.number().int().nonnegative(),
      cacheReadTokens: z.number().int().nonnegative(),
      cacheWriteTokens: z.number().int().nonnegative(),
      estimatedCost: z.number().nonnegative(),
      billedCost: z.number().nonnegative(),
      unpricedRequests: z.number().int().nonnegative(),
    }),
  ),
});

export const recordsResponseSchema = z.object({
  rows: z.array(usageRecordSchema.extend({ id: z.number().int().positive(), machine: z.string() })),
  nextCursor: z.string().optional(),
});

export const quotaSnapshotSchema = z.object({
  provider: z.string().min(1),
  takenAt: z.string().datetime({ offset: true }),
  percentUsed: z.number().finite().min(0).max(100).optional(),
  plan: z.string().min(1).optional(),
  resetsAt: z.string().datetime({ offset: true }).optional(),
  raw: z.record(z.string(), z.unknown()),
});

export const quotaIngestRequestSchema = z.object({
  snapshot: quotaSnapshotSchema,
});

export const quotaIngestResponseSchema = z.object({
  accepted: z.boolean(),
  reason: z.string().optional(),
});

export const quotaSnapshotSeriesPointSchema = z.object({
  takenAt: z.string(),
  percentUsed: z.number().finite().min(0).max(100).optional(),
});

export const quotaSnapshotAccountSchema = z.object({
  account: z.string().min(1),
  provider: z.string().min(1),
  latest: z.object({
    takenAt: z.string(),
    percentUsed: z.number().finite().min(0).max(100).optional(),
    plan: z.string().nullable(),
    resetsAt: z.string().nullable(),
  }),
  series: z.array(quotaSnapshotSeriesPointSchema),
});

export const quotaSnapshotsResponseSchema = z.object({
  provider: z.string().min(1),
  accounts: z.array(quotaSnapshotAccountSchema),
});

export type UsageRecordInput = z.input<typeof usageRecordSchema>;
export type IngestPayloadInput = z.input<typeof ingestPayloadSchema>;
export type IngestRequestInput = z.input<typeof ingestRequestSchema>;
export type IngestResponse = z.infer<typeof ingestResponseSchema>;
export type MachineRegisterRequest = z.infer<typeof machineRegisterRequestSchema>;
export type MachineRegisterResponse = z.infer<typeof machineRegisterResponseSchema>;
export type MachineListItem = z.infer<typeof machineListItemSchema>;
export type StatsSummaryResponse = z.infer<typeof statsSummaryResponseSchema>;
export type StatsDailyResponse = z.infer<typeof statsDailyResponseSchema>;
export type StatsHeatmapResponse = z.infer<typeof statsHeatmapResponseSchema>;
export type StatsModelsResponse = z.infer<typeof statsModelsResponseSchema>;
export type RecordsResponse = z.infer<typeof recordsResponseSchema>;
export type QuotaSnapshotInput = z.input<typeof quotaSnapshotSchema>;
export type QuotaSnapshot = z.infer<typeof quotaSnapshotSchema>;
export type QuotaIngestRequestInput = z.input<typeof quotaIngestRequestSchema>;
export type QuotaIngestResponse = z.infer<typeof quotaIngestResponseSchema>;
export type QuotaSnapshotsResponse = z.infer<typeof quotaSnapshotsResponseSchema>;
