import { useMemo } from "react";
import {
  useAvailableFilters,
  useDaily,
  useHeatmap,
  useMachines,
  useModels,
  useQuotaSnapshots,
  useSummary,
} from "./data/hooks";
import { FilterBar } from "./filters/FilterBar";
import { previousPeriod, resolveApiFilters, resolveDateRange } from "./filters/presets";
import { useFilters } from "./filters/useFilters";
import { DailyChart } from "./features/daily/DailyChart";
import { CalendarHeatmap } from "./features/heatmap/CalendarHeatmap";
import { HourlyHeatmap } from "./features/heatmap/HourlyHeatmap";
import { ModelsTable } from "./features/models/ModelsTable";
import { CopilotQuotaCards } from "./features/quota/CopilotQuotaCards";
import { SummaryCards } from "./features/summary/SummaryCards";
import { useTheme, type ThemeName } from "./theme/useTheme";

export function App() {
  const theme = useTheme();
  return <Dashboard theme={theme} />;
}

function Dashboard({ theme }: { theme: ThemeName }) {
  const { filters, setFilters } = useFilters();
  const apiFilters = useMemo(() => resolveApiFilters(filters), [filters]);
  const previousFilters = useMemo(() => previousPeriod(filters), [filters]);
  const optionFilters = useMemo(
    () => ({
      ...apiFilters,
      agent: [],
      provider: [],
      model: [],
    }),
    [apiFilters],
  );
  const modelOptionFilters = useMemo(
    () => ({
      ...apiFilters,
      model: [],
    }),
    [apiFilters],
  );

  const summary = useSummary(apiFilters);
  const previousSummary = useSummary(previousFilters ?? {}, Boolean(previousFilters));
  const daily = useDaily(apiFilters, filters.dailyGroupBy);
  const dailyMachine = useDaily(apiFilters, "machine");
  const dailyAgentOptions = useDaily(optionFilters, "agent");
  const dailyCalendar = useDaily(apiFilters, "none");
  const heatmap = useHeatmap(apiFilters, filters.heatmapMetric, browserTimeZone());
  const heatmapRequests = useHeatmap(apiFilters, "requests", browserTimeZone());
  const models = useModels(apiFilters);
  const quota = useQuotaSnapshots(apiFilters, "copilot");
  const modelOptions = useModels(modelOptionFilters);
  const machines = useMachines();
  const availableFilters = useAvailableFilters(optionFilters);

  const agents = availableFilters.data?.agents ?? unique(
    (dailyAgentOptions.data?.rows ?? []).map((row) => row.group).filter((value): value is string => Boolean(value)),
  );
  const providers = availableFilters.data?.providers ?? [];
  const modelNames = unique(
    (modelOptions.data?.rows ?? []).map((row) => row.model).filter((value): value is string => Boolean(value)),
  );
  const activeMachines = unique(
    (dailyMachine.data?.rows ?? []).map((row) => row.group).filter((value): value is string => Boolean(value)),
  ).length;
  const selectedRange = resolveDateRange(filters);
  const calendarYear = selectedRange.to ? Number(selectedRange.to.slice(0, 4)) : new Date().getFullYear();

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">TokenViewer</p>
          <h1>Usage desk</h1>
        </div>
        <span className="status-pill">{summary.isFetching ? "Loading" : "Local"}</span>
      </header>

      <FilterBar
        filters={filters}
        machines={machines.data ?? []}
        agents={agents}
        providers={providers}
        models={modelNames}
        onChange={(patch) => setFilters(patch)}
      />

      <SummaryCards
        current={summary.data}
        previous={previousSummary.data}
        activeMachines={activeMachines}
        isLoading={summary.isPending}
        error={summary.error}
      />
      <CopilotQuotaCards data={quota.data} theme={theme} isLoading={quota.isPending} error={quota.error} />

      <div className="dashboard-grid">
        <DailyChart
          data={daily.data}
          groupBy={filters.dailyGroupBy}
          metric={filters.dailyMetric}
          theme={theme}
          isLoading={daily.isPending}
          error={daily.error}
          onGroupByChange={(dailyGroupBy) => setFilters({ dailyGroupBy })}
          onMetricChange={(dailyMetric) => setFilters({ dailyMetric })}
        />
        <HourlyHeatmap
          data={heatmap.data}
          requests={heatmapRequests.data}
          theme={theme}
          isLoading={heatmap.isPending}
          error={heatmap.error}
        />
        <CalendarHeatmap
          data={dailyCalendar.data}
          metric={filters.heatmapMetric}
          theme={theme}
          year={calendarYear}
          isLoading={dailyCalendar.isPending}
          error={dailyCalendar.error}
        />
        <ModelsTable data={models.data} isLoading={models.isPending} error={models.error} />
      </div>
    </main>
  );
}

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
