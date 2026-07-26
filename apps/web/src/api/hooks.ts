import { useQuery } from "@tanstack/react-query";
import {
  fetchDaily,
  fetchHeatmap,
  fetchMachines,
  fetchModels,
  fetchQuotaSnapshots,
  fetchSummary,
  type ApiFilters,
} from "./client";

export function useSummary(filters: ApiFilters, enabled = true) {
  return useQuery({
    queryKey: ["stats", "summary", keyFromFilters(filters)],
    queryFn: () => fetchSummary(filters),
    enabled,
  });
}

export function useDaily(
  filters: ApiFilters,
  groupBy: "none" | "agent" | "model" | "machine",
  enabled = true,
) {
  return useQuery({
    queryKey: ["stats", "daily", groupBy, keyFromFilters(filters)],
    queryFn: () => fetchDaily(filters, groupBy),
    enabled,
  });
}

export function useHeatmap(
  filters: ApiFilters,
  metric: "tokens" | "cost" | "requests",
  tz: string,
  enabled = true,
) {
  return useQuery({
    queryKey: ["stats", "heatmap", metric, tz, keyFromFilters(filters)],
    queryFn: () => fetchHeatmap(filters, metric, tz),
    enabled,
  });
}

export function useModels(filters: ApiFilters, enabled = true) {
  return useQuery({
    queryKey: ["stats", "models", keyFromFilters(filters)],
    queryFn: () => fetchModels(filters),
    enabled,
  });
}

export function useMachines(enabled = true) {
  return useQuery({
    queryKey: ["machines"],
    queryFn: fetchMachines,
    enabled,
  });
}

export function useQuotaSnapshots(filters: ApiFilters, provider = "copilot", enabled = true) {
  return useQuery({
    queryKey: ["quota", provider, keyFromFilters(filters)],
    queryFn: () => fetchQuotaSnapshots(filters, provider),
    enabled,
  });
}

export function keyFromFilters(filters: ApiFilters): string {
  const params = new URLSearchParams();
  for (const key of ["from", "to"] as const) {
    if (filters[key]) {
      params.set(key, filters[key]);
    }
  }
  for (const key of ["machine", "agent", "model"] as const) {
    for (const value of [...(filters[key] ?? [])].sort()) {
      params.append(key, value);
    }
  }
  return params.toString();
}
