import {
  DEFAULT_FILTERS,
  type DailyGroupBy,
  type DailyMetric,
  type DashboardFilters,
  type HeatmapMetric,
  type RangePreset,
} from "./types";

const rangeValues = new Set<RangePreset>(["7d", "30d", "90d", "year", "all", "custom"]);
const heatmapMetricValues = new Set<HeatmapMetric>(["tokens", "cost", "requests"]);
const dailyGroupValues = new Set<DailyGroupBy>(["agent", "model", "machine"]);
const dailyMetricValues = new Set<DailyMetric>(["tokens", "cost"]);

export function parseFilters(search: string): DashboardFilters {
  const params = new URLSearchParams(search);
  return {
    range: enumValue(params.get("range"), rangeValues, DEFAULT_FILTERS.range),
    from: params.get("from") || undefined,
    to: params.get("to") || undefined,
    machines: params.getAll("machine").filter(Boolean),
    agents: params.getAll("agent").filter(Boolean),
    providers: params.getAll("provider").filter(Boolean),
    models: params.getAll("model").filter(Boolean),
    heatmapMetric: enumValue(params.get("metric"), heatmapMetricValues, DEFAULT_FILTERS.heatmapMetric),
    dailyGroupBy: enumValue(params.get("groupBy"), dailyGroupValues, DEFAULT_FILTERS.dailyGroupBy),
    dailyMetric: enumValue(params.get("dailyMetric"), dailyMetricValues, DEFAULT_FILTERS.dailyMetric),
  };
}

export function serializeFilters(filters: DashboardFilters): string {
  const params = new URLSearchParams();
  if (filters.range !== DEFAULT_FILTERS.range) {
    params.set("range", filters.range);
  }
  if (filters.range === "custom") {
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
  }
  appendRepeated(params, "machine", filters.machines);
  appendRepeated(params, "agent", filters.agents);
  appendRepeated(params, "provider", filters.providers);
  appendRepeated(params, "model", filters.models);
  if (filters.heatmapMetric !== DEFAULT_FILTERS.heatmapMetric) {
    params.set("metric", filters.heatmapMetric);
  }
  if (filters.dailyGroupBy !== DEFAULT_FILTERS.dailyGroupBy) {
    params.set("groupBy", filters.dailyGroupBy);
  }
  if (filters.dailyMetric !== DEFAULT_FILTERS.dailyMetric) {
    params.set("dailyMetric", filters.dailyMetric);
  }
  return params.toString();
}

export function normalizeFilters(filters: DashboardFilters): DashboardFilters {
  return {
    ...filters,
    from: filters.range === "custom" ? filters.from : undefined,
    to: filters.range === "custom" ? filters.to : undefined,
    machines: unique(filters.machines),
    agents: unique(filters.agents),
    providers: unique(filters.providers),
    models: unique(filters.models),
  };
}

function enumValue<T extends string>(value: string | null, values: Set<T>, fallback: T): T {
  return value && values.has(value as T) ? (value as T) : fallback;
}

function appendRepeated(params: URLSearchParams, key: string, values: string[]): void {
  for (const value of values) {
    if (value) {
      params.append(key, value);
    }
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
