import { snapshotMachineSchema } from "@tokenviewer/core/snapshots";
import { z } from "zod";

const quotaSeriesPointSchema = z.object({
  takenAt: z.string(),
  percentUsed: z.number().finite().min(0).max(100).optional(),
});

const quotaGroupSchema = z.object({
  machine: snapshotMachineSchema,
  provider: z.string().min(1),
  latest: z.object({
    takenAt: z.string(),
    percentUsed: z.number().finite().min(0).max(100).optional(),
    plan: z.string().nullable(),
    resetsAt: z.string().nullable(),
  }),
  series: z.array(quotaSeriesPointSchema),
});

export const localQuotaSnapshotsResponseSchema = z.object({
  provider: z.string().min(1),
  groups: z.array(quotaGroupSchema),
});

export type LocalQuotaSnapshotsResponse = z.infer<typeof localQuotaSnapshotsResponseSchema>;
