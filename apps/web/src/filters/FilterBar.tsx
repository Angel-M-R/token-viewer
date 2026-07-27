import type { MachineListItem } from "@tokenviewer/core/schemas";
import { Boxes, CalendarDays, DollarSign, Hash, Layers3, Server, Sigma } from "lucide-react";
import { RANGE_LABELS } from "./presets";
import type { DashboardFilters, HeatmapMetric, RangePreset } from "./types";

interface FilterBarProps {
  filters: DashboardFilters;
  machines: MachineListItem[];
  agents: string[];
  providers: string[];
  models: string[];
  onChange: (patch: Partial<DashboardFilters>) => void;
}

const heatmapMetrics: Array<{ value: HeatmapMetric; label: string; icon: typeof Sigma }> = [
  { value: "tokens", label: "Tokens", icon: Sigma },
  { value: "cost", label: "Cost", icon: DollarSign },
  { value: "requests", label: "Requests", icon: Hash },
];

export function FilterBar({ filters, machines, agents, providers, models, onChange }: FilterBarProps) {
  return (
    <section className="filter-bar" aria-label="Global filters">
      <div className="filter-group filter-range">
        <label>
          <span>
            <CalendarDays size={15} aria-hidden="true" /> Range
          </span>
          <select
            value={filters.range}
            onChange={(event) => onChange({ range: event.target.value as RangePreset })}
          >
            {Object.entries(RANGE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {filters.range === "custom" ? (
          <div className="custom-range">
            <input
              aria-label="From date"
              type="date"
              value={filters.from ?? ""}
              onChange={(event) => onChange({ from: event.target.value || undefined })}
            />
            <input
              aria-label="To date"
              type="date"
              value={filters.to ?? ""}
              onChange={(event) => onChange({ to: event.target.value || undefined })}
            />
          </div>
        ) : null}
      </div>

      <MultiSelect
        icon={Server}
        label="Machines"
        values={filters.machines}
        options={machines.map((machine) => machine.name)}
        onChange={(machines) => onChange({ machines })}
      />
      <MultiSelect
        icon={Layers3}
        label="Agents"
        values={filters.agents}
        options={agents}
        onChange={(agents) => onChange({ agents })}
      />
      <MultiSelect
        icon={Boxes}
        label="Providers"
        values={filters.providers}
        options={providers}
        onChange={(providers) => onChange({ providers })}
      />
      <MultiSelect
        icon={Sigma}
        label="Models"
        values={filters.models}
        options={models}
        onChange={(models) => onChange({ models })}
      />

      <div className="metric-toggle" role="group" aria-label="Heatmap metric">
        {heatmapMetrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <button
              key={metric.value}
              type="button"
              className={filters.heatmapMetric === metric.value ? "active" : ""}
              onClick={() => onChange({ heatmapMetric: metric.value })}
              title={`Heatmap: ${metric.label}`}
            >
              <Icon size={15} aria-hidden="true" />
              <span>{metric.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function MultiSelect({
  icon: Icon,
  label,
  values,
  options,
  onChange,
}: {
  icon: typeof Server;
  label: string;
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <label className="filter-group">
      <span>
        <Icon size={15} aria-hidden="true" /> {label}
      </span>
      <select
        multiple
        value={values}
        size={Math.min(Math.max(options.length, 2), 4)}
        onChange={(event) =>
          onChange(Array.from(event.currentTarget.selectedOptions).map((option) => option.value))
        }
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
