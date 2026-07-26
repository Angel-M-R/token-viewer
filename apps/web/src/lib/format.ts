export function totalTokens(value: {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}): number {
  return (
    value.inputTokens +
    value.outputTokens +
    value.reasoningTokens +
    value.cacheReadTokens +
    value.cacheWriteTokens
  );
}

export function formatTokens(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: value >= 1_000 ? 1 : 0,
  }).format(value);
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatInteger(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "percent",
    signDisplay: "exceptZero",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

export function formatMetric(metric: "tokens" | "cost" | "requests", value: number): string {
  if (metric === "cost") return formatUsd(value);
  if (metric === "requests") return formatInteger(value);
  return formatTokens(value);
}

