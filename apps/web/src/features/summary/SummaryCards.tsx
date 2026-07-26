import type { StatsSummaryResponse } from "@tokenviewer/core/schemas";
import { Cpu, DollarSign, GitCompareArrows, Server, Sigma } from "lucide-react";
import { formatInteger, formatPercent, formatTokens, formatUsd, totalTokens } from "../../lib/format";

interface SummaryCardsProps {
  current?: StatsSummaryResponse;
  previous?: StatsSummaryResponse;
  activeMachines: number;
  isLoading: boolean;
  error?: unknown;
}

export function SummaryCards({ current, previous, activeMachines, isLoading, error }: SummaryCardsProps) {
  const summary = current ?? emptySummary();
  const tokens = totalTokens(summary);
  const previousTokens = previous ? totalTokens(previous) : undefined;
  const cards = [
    {
      label: "Tokens",
      value: formatTokens(tokens),
      raw: tokens,
      previous: previousTokens,
      icon: Sigma,
      tooltip: [
        `Input ${formatTokens(summary.inputTokens)}`,
        `Output ${formatTokens(summary.outputTokens + summary.reasoningTokens)}`,
        `Cache ${formatTokens(summary.cacheReadTokens + summary.cacheWriteTokens)}`,
      ].join(" | "),
    },
    {
      label: "Estimated cost",
      value: formatUsd(summary.estimatedCost),
      raw: summary.estimatedCost,
      previous: previous?.estimatedCost,
      icon: DollarSign,
    },
    {
      label: "Requests",
      value: formatInteger(summary.requests),
      raw: summary.requests,
      previous: previous?.requests,
      icon: GitCompareArrows,
    },
    {
      label: "Active machines",
      value: formatInteger(activeMachines),
      raw: activeMachines,
      previous: undefined,
      icon: Server,
    },
  ];

  if (error) {
    return (
      <section className="summary-grid">
        <div className="summary-card full-width error">Summary unavailable</div>
      </section>
    );
  }

  return (
    <section className="summary-grid" aria-label="Summary">
      {cards.map((card) => {
        const Icon = card.icon;
        const delta = card.previous && card.previous > 0 ? (card.raw - card.previous) / card.previous : null;
        return (
          <article key={card.label} className="summary-card" title={card.tooltip}>
            <div className="summary-topline">
              <span>{card.label}</span>
              <Icon size={18} aria-hidden="true" />
            </div>
            <strong>{isLoading ? "..." : card.value}</strong>
            {delta === null ? (
              <small>{summary.requests === 0 ? "No data" : "Delta n/a"}</small>
            ) : (
              <small className={delta >= 0 ? "delta-up" : "delta-down"}>{formatPercent(delta)}</small>
            )}
          </article>
        );
      })}
      {summary.unpricedRequests > 0 ? (
        <div className="summary-note">
          <Cpu size={16} aria-hidden="true" />
          {formatInteger(summary.unpricedRequests)} unpriced requests
        </div>
      ) : null}
    </section>
  );
}

function emptySummary(): StatsSummaryResponse {
  return {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    estimatedCost: 0,
    billedCost: 0,
    unpricedRequests: 0,
    modelCount: 0,
  };
}
