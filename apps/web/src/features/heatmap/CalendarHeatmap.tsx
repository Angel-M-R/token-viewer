import type { StatsDailyResponse } from "@tokenviewer/core/schemas";
import { CalendarRange } from "lucide-react";
import { EChart } from "../../charts/EChart";
import type { EChartsCoreOption } from "../../charts/registry";
import { dailyValue } from "../daily/dailyMath";
import { dateOnly } from "../../filters/presets";
import type { HeatmapMetric } from "../../filters/types";
import { formatMetric } from "../../lib/format";
import type { ThemeName } from "../../theme/useTheme";

interface CalendarHeatmapProps {
  data?: StatsDailyResponse;
  metric: HeatmapMetric;
  theme: ThemeName;
  year: number;
  isLoading: boolean;
  error?: unknown;
}

export function CalendarHeatmap({ data, metric, theme, year, isLoading, error }: CalendarHeatmapProps) {
  const daily = new Map<string, number>();
  for (const row of data?.rows ?? []) {
    daily.set(row.day, (daily.get(row.day) ?? 0) + dailyValue(row, metric));
  }
  const values = daysInYear(year).map((day) => [day, daily.get(day) ?? 0] as [string, number]);
  const max = Math.max(...values.map(([, value]) => value), 1);

  const option: EChartsCoreOption = {
    tooltip: {
      formatter: (params: unknown) => {
        const [day, value] = (params as { data: [string, number] }).data;
        return `${day}<br/>${formatMetric(metric, value)}`;
      },
    },
    visualMap: {
      min: 0,
      max,
      show: false,
      inRange: { color: ["#ece8dd", "#d0a844", "#4776d0", "#2f9d7e"] },
    },
    calendar: {
      top: 28,
      left: 30,
      right: 18,
      cellSize: ["auto", 14],
      range: String(year),
      itemStyle: { borderWidth: 2, borderColor: "transparent" },
      splitLine: { show: false },
      dayLabel: { firstDay: 1 },
      monthLabel: { color: "inherit" },
    },
    series: [
      {
        type: "heatmap",
        coordinateSystem: "calendar",
        data: values,
      },
    ],
  };

  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <h2>
            <CalendarRange size={18} aria-hidden="true" /> Year trace
          </h2>
          <p>{year} daily intensity</p>
        </div>
      </div>
      <PanelState isLoading={isLoading} error={error} empty={(data?.rows ?? []).length === 0} />
      <EChart option={option} theme={theme} className="chart calendar-chart" ariaLabel="Calendar heatmap" />
    </section>
  );
}

function daysInYear(year: number): string[] {
  const days: string[] = [];
  const date = new Date(year, 0, 1);
  while (date.getFullYear() === year) {
    days.push(dateOnly(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
}

function PanelState({ isLoading, error, empty }: { isLoading: boolean; error?: unknown; empty: boolean }) {
  if (isLoading) return <div className="panel-state">Loading calendar activity...</div>;
  if (error) return <div className="panel-state error">Calendar unavailable</div>;
  if (empty) return <div className="panel-state">Zero-value days are shown in the base color</div>;
  return null;
}
