import type { LocalFilters } from "../data/repository";
import type { DashboardFilters, RangePreset } from "./types";

const DAY_MS = 86_400_000;

export const RANGE_LABELS: Record<RangePreset, string> = {
  "7d": "7d",
  "30d": "30d",
  "90d": "90d",
  year: "Year",
  all: "All",
  custom: "Custom",
};

export function resolveApiFilters(filters: DashboardFilters, now = new Date()): LocalFilters {
  const range = resolveDateRange(filters, now);
  return {
    ...range,
    machine: filters.machines,
    agent: filters.agents,
    provider: filters.providers,
    model: filters.models,
  };
}

export function resolveDateRange(
  filters: Pick<DashboardFilters, "range" | "from" | "to">,
  now = new Date(),
): { from?: string; to?: string } {
  if (filters.range === "all") {
    return {};
  }
  if (filters.range === "custom") {
    return {
      from: filters.from || undefined,
      to: filters.to || undefined,
    };
  }

  const today = dateOnly(now);
  if (filters.range === "year") {
    const year = now.getFullYear();
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }

  const days = Number(filters.range.replace("d", ""));
  return {
    from: dateOnly(addDays(parseDateOnly(today), -(days - 1))),
    to: today,
  };
}

export function previousPeriod(filters: DashboardFilters, now = new Date()): LocalFilters | null {
  const current = resolveDateRange(filters, now);
  if (!current.from || !current.to) {
    return null;
  }

  const from = parseDateOnly(current.from);
  const to = parseDateOnly(current.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    return null;
  }

  const days = Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1;
  const previousTo = addDays(from, -1);
  const previousFrom = addDays(previousTo, -(days - 1));
  return {
    from: dateOnly(previousFrom),
    to: dateOnly(previousTo),
    machine: filters.machines,
    agent: filters.agents,
    provider: filters.providers,
    model: filters.models,
  };
}

export function dateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
