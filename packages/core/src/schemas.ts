import { z } from "zod";

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

export type MachineListItem = z.infer<typeof machineListItemSchema>;
export type StatsSummaryResponse = z.infer<typeof statsSummaryResponseSchema>;
export type StatsDailyResponse = z.infer<typeof statsDailyResponseSchema>;
export type StatsModelsResponse = z.infer<typeof statsModelsResponseSchema>;
