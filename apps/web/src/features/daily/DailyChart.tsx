import type { StatsDailyResponse } from "@tokenviewer/core/schemas";
import { BarChart3, CircleDollarSign, Sigma } from "lucide-react";
import { EChart } from "../../charts/EChart";
import type { EChartsCoreOption } from "../../charts/registry";
import { formatDate, formatMetric } from "../../lib/format";
import { colorForSeries } from "../../theme/providers";
import type { ThemeName } from "../../theme/useTheme";
import type { DailyGroupBy, DailyMetric as FilterDailyMetric } from "../../filters/types";
import { aggregateDailyTotals, dailyValue, movingAverage } from "./dailyMath";

interface DailyChartProps {
  data?: StatsDailyResponse;
  groupBy: DailyGroupBy;
  metric: FilterDailyMetric;
  theme: ThemeName;
  isLoading: boolean;
  error?: unknown;
  onGroupByChange: (groupBy: DailyGroupBy) => void;
  onMetricChange: (metric: FilterDailyMetric) => void;
}

const groupOptions: DailyGroupBy[] = ["agent", "model", "machine"];

export function DailyChart({
  data,
  groupBy,
  metric,
  theme,
  isLoading,
  error,
  onGroupByChange,
  onMetricChange,
}: DailyChartProps) {
  const rows = data?.rows ?? [];
  const days = [...new Set(rows.map((row) => row.day))].sort();
  const groups = [...new Set(rows.map((row) => row.group ?? "total"))].sort();
  const totals = aggregateDailyTotals(rows, metric);
  const average = movingAverage(totals.map((item) => item.value));

  const option: EChartsCoreOption = {
    grid: { left: 56, right: 28, top: 32, bottom: 48 },
    tooltip: {
      trigger: "axis",
      valueFormatter: (value: unknown) => formatMetric(metric, Number(value)),
    },
    legend: { top: 0, type: "scroll" },
    xAxis: {
      type: "category",
      data: days,
      axisLabel: { formatter: (value: string | number) => formatDate(String(value)) },
    },
    yAxis: {
      type: "value",
      axisLabel: { formatter: (value: number) => formatMetric(metric, value) },
    },
    series: [
      ...groups.map((group, index) => ({
        type: "bar" as const,
        name: group,
        stack: "usage",
        emphasis: { focus: "series" },
        itemStyle: { color: colorForSeries(group, index) },
        data: days.map((day) => {
          const row = rows.find((item) => item.day === day && (item.group ?? "total") === group);
          return row ? dailyValue(row, metric) : 0;
        }),
      })),
      {
        type: "line" as const,
        name: "7d avg",
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2.5 },
        data: days.map((day, index) => (totals[index]?.day === day ? average[index] : 0)),
      },
    ],
  };

  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <h2>
            <BarChart3 size={18} aria-hidden="true" /> Daily usage
          </h2>
          <p>{groupBy} stacks with a 7-day moving average</p>
        </div>
        <div className="chart-controls">
          <div className="segmented" role="group" aria-label="Daily grouping">
            {groupOptions.map((optionValue) => (
              <button
                key={optionValue}
                type="button"
                className={optionValue === groupBy ? "active" : ""}
                onClick={() => onGroupByChange(optionValue)}
              >
                {optionValue}
              </button>
            ))}
          </div>
          <div className="segmented icon-segmented" role="group" aria-label="Daily metric">
            <button
              type="button"
              title="Tokens"
              className={metric === "tokens" ? "active" : ""}
              onClick={() => onMetricChange("tokens")}
            >
              <Sigma size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              title="Cost"
              className={metric === "cost" ? "active" : ""}
              onClick={() => onMetricChange("cost")}
            >
              <CircleDollarSign size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      <PanelState isLoading={isLoading} error={error} empty={rows.length === 0} />
      {rows.length > 0 ? (
        <EChart option={option} theme={theme} className="chart daily-chart" ariaLabel="Daily usage chart" />
      ) : null}
    </section>
  );
}

function PanelState({ isLoading, error, empty }: { isLoading: boolean; error?: unknown; empty: boolean }) {
  if (isLoading) return <div className="panel-state">Loading daily usage...</div>;
  if (error) return <div className="panel-state error">Daily usage unavailable</div>;
  if (empty) return <div className="panel-state">No daily activity for these filters</div>;
  return null;
}
