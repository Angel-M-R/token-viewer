export type RangePreset = "7d" | "30d" | "90d" | "year" | "all" | "custom";
export type HeatmapMetric = "tokens" | "cost" | "requests";
export type DailyGroupBy = "agent" | "model" | "machine";
export type DailyMetric = "tokens" | "cost";

export interface DashboardFilters {
  range: RangePreset;
  from?: string;
  to?: string;
  machines: string[];
  agents: string[];
  models: string[];
  heatmapMetric: HeatmapMetric;
  dailyGroupBy: DailyGroupBy;
  dailyMetric: DailyMetric;
}

export const DEFAULT_FILTERS: DashboardFilters = {
  range: "30d",
  machines: [],
  agents: [],
  models: [],
  heatmapMetric: "tokens",
  dailyGroupBy: "agent",
  dailyMetric: "tokens",
};

