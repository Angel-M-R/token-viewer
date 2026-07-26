import type { StatsHeatmapResponse } from "@tokenviewer/core/schemas";
import { Clock3 } from "lucide-react";
import { EChart } from "../../charts/EChart";
import type { EChartsCoreOption } from "../../charts/registry";
import { formatMetric } from "../../lib/format";
import type { ThemeName } from "../../theme/useTheme";

interface HourlyHeatmapProps {
  data?: StatsHeatmapResponse;
  requests?: StatsHeatmapResponse;
  theme: ThemeName;
  isLoading: boolean;
  error?: unknown;
}

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hours = Array.from({ length: 24 }, (_, index) => `${String(index).padStart(2, "0")}:00`);

export function HourlyHeatmap({ data, requests, theme, isLoading, error }: HourlyHeatmapProps) {
  const metric = data?.metric ?? "tokens";
  const matrix = data?.matrix ?? [];
  const requestMatrix = requests?.matrix ?? matrix;
  const values = matrix.flat();
  const max = Math.max(...values, 1);
  const seriesData = matrix.flatMap((row, day) =>
    row.map((value, hour) => [hour, day, value, requestMatrix[day]?.[hour] ?? 0]),
  );

  const option: EChartsCoreOption = {
    tooltip: {
      position: "top",
      formatter: (params: unknown) => {
        const item = (params as { data: [number, number, number, number] }).data;
        return `${weekdays[item[1]]} ${hours[item[0]]}<br/>${formatMetric(metric, item[2])}<br/>${formatMetric("requests", item[3])} requests`;
      },
    },
    grid: { top: 28, left: 48, right: 24, bottom: 72 },
    xAxis: { type: "category", data: hours, splitArea: { show: true } },
    yAxis: { type: "category", data: weekdays, splitArea: { show: true } },
    visualMap: {
      min: 0,
      max,
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: 8,
      inRange: { color: ["#ece8dd", "#d0a844", "#4776d0", "#2f9d7e"] },
    },
    series: [
      {
        type: "heatmap",
        data: seriesData,
        emphasis: { itemStyle: { borderColor: "#20251f", borderWidth: 1 } },
      },
    ],
  };

  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <h2>
            <Clock3 size={18} aria-hidden="true" /> Hourly rhythm
          </h2>
          <p>{data?.tz ?? "Local"} timezone buckets</p>
        </div>
      </div>
      <PanelState isLoading={isLoading} error={error} empty={matrix.length === 0} />
      {matrix.length > 0 ? (
        <EChart option={option} theme={theme} className="chart heatmap-chart" ariaLabel="Hourly heatmap" />
      ) : null}
    </section>
  );
}

function PanelState({ isLoading, error, empty }: { isLoading: boolean; error?: unknown; empty: boolean }) {
  if (isLoading) return <div className="panel-state">Loading hourly activity...</div>;
  if (error) return <div className="panel-state error">Hourly heatmap unavailable</div>;
  if (empty) return <div className="panel-state">No hourly activity for these filters</div>;
  return null;
}
