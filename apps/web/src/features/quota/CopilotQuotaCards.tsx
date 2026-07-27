import { Monitor, RotateCcw } from "lucide-react";
import { EChart } from "../../charts/EChart";
import type { EChartsCoreOption } from "../../charts/registry";
import type { LocalQuotaSnapshotsResponse } from "../../data/contracts";
import type { ThemeName } from "../../theme/useTheme";

interface CopilotQuotaCardsProps {
  data?: LocalQuotaSnapshotsResponse;
  theme: ThemeName;
  isLoading: boolean;
  error?: unknown;
}

export function CopilotQuotaCards({ data, theme, isLoading, error }: CopilotQuotaCardsProps) {
  if (isLoading || error || !data || data.groups.length === 0) {
    return null;
  }

  return (
    <section className="quota-grid" aria-label="Copilot quota">
      {data.groups.map((group) => (
        <article key={`${group.provider}:${group.machine}`} className="summary-card quota-card">
          <div className="summary-topline">
            <span>
              <Monitor size={16} aria-hidden="true" /> Copilot
            </span>
            <span>{group.machine}</span>
          </div>
          <div className="quota-card-body">
            <EChart
              option={gaugeOption(group.latest.percentUsed)}
              theme={theme}
              className="quota-gauge"
              ariaLabel={`${group.machine} Copilot quota gauge`}
            />
            <div className="quota-meta">
              <strong>{percentLabel(group.latest.percentUsed)}</strong>
              <span>{group.latest.plan ?? "Plan n/a"}</span>
              <span>
                <RotateCcw size={14} aria-hidden="true" /> {daysUntilReset(group.latest.resetsAt)}
              </span>
            </div>
          </div>
          {group.series.length > 1 ? (
            <EChart
              option={sparklineOption(group.series)}
              theme={theme}
              className="quota-sparkline"
              ariaLabel={`${group.machine} Copilot quota trend`}
            />
          ) : (
            <div className="quota-single-point">Single snapshot</div>
          )}
        </article>
      ))}
    </section>
  );
}

function gaugeOption(percent: number | undefined): EChartsCoreOption {
  const value = percent ?? 0;
  return {
    series: [
      {
        type: "gauge",
        min: 0,
        max: 100,
        startAngle: 210,
        endAngle: -30,
        radius: "98%",
        progress: { show: true, width: 10 },
        axisLine: {
          lineStyle: {
            width: 10,
            color: [
              [0.75, "#2f9d7e"],
              [0.9, "#d09c36"],
              [1, "#c24b5a"],
            ],
          },
        },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        pointer: { show: false },
        detail: { show: false },
        data: [{ value }],
      },
    ],
  };
}

function sparklineOption(series: LocalQuotaSnapshotsResponse["groups"][number]["series"]): EChartsCoreOption {
  return {
    grid: { left: 6, right: 6, top: 8, bottom: 8 },
    xAxis: { type: "category", show: false, data: series.map((point) => point.takenAt) },
    yAxis: { type: "value", show: false, min: 0, max: 100 },
    tooltip: {
      trigger: "axis",
      valueFormatter: (value: unknown) => `${Number(value).toFixed(0)}%`,
    },
    series: [
      {
        type: "line",
        smooth: true,
        showSymbol: series.length === 1,
        symbolSize: 6,
        lineStyle: { width: 2 },
        areaStyle: { opacity: 0.16 },
        data: series.map((point) => point.percentUsed ?? 0),
      },
    ],
  };
}

function percentLabel(percent: number | undefined): string {
  return percent === undefined ? "—" : `${Math.round(percent)}%`;
}

function daysUntilReset(resetsAt: string | null): string {
  if (!resetsAt) return "—";
  const days = Math.ceil((new Date(resetsAt).getTime() - Date.now()) / 86_400_000);
  if (!Number.isFinite(days)) return "—";
  return `${Math.max(days, 0)}d`;
}
