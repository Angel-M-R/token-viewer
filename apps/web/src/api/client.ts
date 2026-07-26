import {
  machineListItemSchema,
  quotaSnapshotsResponseSchema,
  statsDailyResponseSchema,
  statsHeatmapResponseSchema,
  statsModelsResponseSchema,
  statsSummaryResponseSchema,
  type MachineListItem,
  type QuotaSnapshotsResponse,
  type StatsDailyResponse,
  type StatsHeatmapResponse,
  type StatsModelsResponse,
  type StatsSummaryResponse,
} from "@tokenviewer/core/schemas";
import { z } from "zod";

export interface ApiFilters {
  from?: string;
  to?: string;
  machine?: string[];
  agent?: string[];
  model?: string[];
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const machinesResponseSchema = z.object({
  machines: z.array(machineListItemSchema),
});

let tokenProvider: () => string | null = () => null;
let unauthorizedHandler: () => void = () => {};

export function configureApiClient(config: {
  getToken: () => string | null;
  onUnauthorized: () => void;
}): void {
  tokenProvider = config.getToken;
  unauthorizedHandler = config.onUnauthorized;
}

export async function fetchSummary(
  filters: ApiFilters,
  options: { suppressUnauthorized?: boolean } = {},
): Promise<StatsSummaryResponse> {
  return apiGet("/stats/summary", statsSummaryResponseSchema, { ...filters }, options);
}

export async function fetchDaily(
  filters: ApiFilters,
  groupBy: "none" | "agent" | "model" | "machine",
): Promise<StatsDailyResponse> {
  return apiGet("/stats/daily", statsDailyResponseSchema, { ...filters, groupBy });
}

export async function fetchHeatmap(
  filters: ApiFilters,
  metric: "tokens" | "cost" | "requests",
  tz: string,
): Promise<StatsHeatmapResponse> {
  return apiGet("/stats/heatmap", statsHeatmapResponseSchema, { ...filters, metric, tz });
}

export async function fetchModels(filters: ApiFilters): Promise<StatsModelsResponse> {
  return apiGet("/stats/models", statsModelsResponseSchema, { ...filters });
}

export async function fetchMachines(): Promise<MachineListItem[]> {
  const response = await apiGet("/machines", machinesResponseSchema, {});
  return response.machines;
}

export async function fetchQuotaSnapshots(
  filters: ApiFilters,
  provider = "copilot",
): Promise<QuotaSnapshotsResponse> {
  return apiGet("/quota-snapshots", quotaSnapshotsResponseSchema, { ...filters, provider });
}

async function apiGet<T>(
  path: string,
  schema: z.ZodType<T>,
  params: Record<string, unknown>,
  options: { suppressUnauthorized?: boolean } = {},
): Promise<T> {
  const url = new URL(`/api/v1${path}`, window.location.origin);
  appendParams(url.searchParams, params);

  const token = tokenProvider();
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${url.pathname}${url.search}`, { headers });
  if (response.status === 401) {
    if (!options.suppressUnauthorized) {
      unauthorizedHandler();
    }
    throw new ApiError(401, "Unauthorized");
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ApiError(response.status, body || response.statusText);
  }

  return schema.parse(await response.json());
}

function appendParams(params: URLSearchParams, values: object): void {
  for (const [key, value] of Object.entries(values) as Array<[string, unknown]>) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item) {
          params.append(key, String(item));
        }
      }
      continue;
    }
    params.set(key, String(value));
  }
}
