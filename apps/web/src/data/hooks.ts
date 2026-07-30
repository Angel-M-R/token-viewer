import { useQuery } from "@tanstack/react-query";
import {
  getLocalSnapshotRepository,
  type DailyGroupBy,
  type LocalFilters,
  type LocalSnapshotRepository,
} from "./repository";
import { useProvidedLocalRepository } from "./repositoryContext";

export function useSummary(filters: LocalFilters, enabled = true) {
  return useLocalQuery("summary", filters, (repository) => repository.querySummary(filters), enabled);
}

export function useDaily(filters: LocalFilters, groupBy: DailyGroupBy, enabled = true) {
  return useLocalQuery(`daily:${groupBy}`, filters, (repository) => repository.queryDaily(filters, groupBy), enabled);
}

export function useModels(filters: LocalFilters, enabled = true) {
  return useLocalQuery("models", filters, (repository) => repository.queryModels(filters), enabled);
}

export function useMachines(enabled = true) {
  return useLocalQuery("machines", {}, (repository) => repository.queryMachines(), enabled);
}

export function useAvailableFilters(filters: LocalFilters, enabled = true) {
  return useLocalQuery(
    "available-filters",
    filters,
    (repository) => repository.queryAvailableFilters(filters),
    enabled,
  );
}

export function useQuotaSnapshots(filters: LocalFilters, provider = "copilot", enabled = true) {
  return useLocalQuery(
    `quota:${provider}`,
    filters,
    (repository) => repository.queryQuotas(filters, provider),
    enabled,
  );
}

export function keyFromFilters(filters: LocalFilters): string {
  const params = new URLSearchParams();
  for (const key of ["from", "to"] as const) {
    if (filters[key]) params.set(key, filters[key]);
  }
  for (const key of ["machine", "agent", "provider", "model"] as const) {
    for (const value of [...(filters[key] ?? [])].sort()) params.append(key, value);
  }
  return params.toString();
}

function useLocalQuery<T>(
  name: string,
  filters: LocalFilters,
  query: (repository: LocalSnapshotRepository) => T,
  enabled: boolean,
) {
  const providedRepository = useProvidedLocalRepository();
  return useQuery({
    queryKey: ["local-snapshots", name, keyFromFilters(filters)],
    queryFn: async () => query(providedRepository ?? getLocalSnapshotRepository()),
    enabled,
  });
}
