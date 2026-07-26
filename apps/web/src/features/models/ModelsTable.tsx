import type { StatsModelsResponse } from "@tokenviewer/core/schemas";
import { ArrowDownUp, Boxes } from "lucide-react";
import { useMemo, useState } from "react";
import { formatInteger, formatPercent, formatTokens, formatUsd, totalTokens } from "../../lib/format";
import { ProviderBadge } from "./ProviderBadge";

interface ModelsTableProps {
  data?: StatsModelsResponse;
  isLoading: boolean;
  error?: unknown;
}

type SortKey = "tokens" | "cost" | "requests" | "share";

export function ModelsTable({ data, isLoading, error }: ModelsTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({
    key: "cost",
    direction: "desc",
  });
  const rows = data?.rows ?? [];
  const totalCost = rows.reduce((sum, row) => sum + row.estimatedCost, 0);
  const totalRequests = rows.reduce((sum, row) => sum + row.requests, 0);
  const totalTokenCount = rows.reduce((sum, row) => sum + totalTokens(row), 0);

  const sorted = useMemo(() => {
    return [...rows].sort((left, right) => {
      const factor = sort.direction === "asc" ? 1 : -1;
      return (metricValue(left, sort.key, totalCost, totalRequests, totalTokenCount) -
        metricValue(right, sort.key, totalCost, totalRequests, totalTokenCount)) *
        factor;
    });
  }, [rows, sort, totalCost, totalRequests, totalTokenCount]);

  return (
    <section className="panel models-panel">
      <div className="panel-heading">
        <div>
          <h2>
            <Boxes size={18} aria-hidden="true" /> Models
          </h2>
          <p>{formatInteger(rows.length)} grouped rows</p>
        </div>
      </div>
      {isLoading ? <div className="panel-state">Loading models...</div> : null}
      {error ? <div className="panel-state error">Model breakdown unavailable</div> : null}
      {!isLoading && !error && rows.length === 0 ? (
        <div className="panel-state">No models for these filters</div>
      ) : null}
      {rows.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Model</th>
                <SortableHeader label="Tokens" active={sort.key === "tokens"} onClick={() => toggleSort("tokens")} />
                <SortableHeader label="Cost" active={sort.key === "cost"} onClick={() => toggleSort("cost")} />
                <SortableHeader
                  label="Requests"
                  active={sort.key === "requests"}
                  onClick={() => toggleSort("requests")}
                />
                <SortableHeader label="Share" active={sort.key === "share"} onClick={() => toggleSort("share")} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const tokens = totalTokens(row);
                const share = totalCost > 0 ? row.estimatedCost / totalCost : tokens / Math.max(totalTokenCount, 1);
                return (
                  <tr key={`${row.provider ?? "unknown"}:${row.model ?? "unknown"}`}>
                    <td>
                      <ProviderBadge provider={row.provider} />
                    </td>
                    <td>{row.model ?? "unknown"}</td>
                    <td>
                      <strong>{formatTokens(tokens)}</strong>
                      <small>
                        {formatTokens(row.inputTokens)} in / {formatTokens(row.outputTokens + row.reasoningTokens)} out /{" "}
                        {formatTokens(row.cacheReadTokens + row.cacheWriteTokens)} cache
                      </small>
                    </td>
                    <td>{formatUsd(row.estimatedCost)}</td>
                    <td>{formatInteger(row.requests)}</td>
                    <td>{formatPercent(share)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );

  function toggleSort(key: SortKey): void {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
  }
}

function SortableHeader({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <th>
      <button type="button" className={active ? "sort active" : "sort"} onClick={onClick}>
        {label}
        <ArrowDownUp size={14} aria-hidden="true" />
      </button>
    </th>
  );
}

function metricValue(
  row: StatsModelsResponse["rows"][number],
  key: SortKey,
  totalCost: number,
  totalRequests: number,
  totalTokenCount: number,
): number {
  if (key === "cost") return row.estimatedCost;
  if (key === "requests") return row.requests;
  if (key === "share") {
    return totalCost > 0
      ? row.estimatedCost / totalCost
      : row.requests / Math.max(totalRequests, 1);
  }
  return totalTokens(row) / Math.max(totalTokenCount, 1);
}
