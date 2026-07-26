import { useCallback, useEffect, useState } from "react";
import { normalizeFilters, parseFilters, serializeFilters } from "./url";
import type { DashboardFilters } from "./types";

export function useFilters(): {
  filters: DashboardFilters;
  setFilters: (patch: Partial<DashboardFilters>, options?: { replace?: boolean }) => void;
} {
  const [filters, setFilterState] = useState(() => parseFilters(window.location.search));

  useEffect(() => {
    const onPopState = () => {
      setFilterState(parseFilters(window.location.search));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const setFilters = useCallback(
    (patch: Partial<DashboardFilters>, options: { replace?: boolean } = {}) => {
      setFilterState((current) => {
        const next = normalizeFilters({ ...current, ...patch });
        const query = serializeFilters(next);
        const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
        if (options.replace) {
          window.history.replaceState(null, "", nextUrl);
        } else {
          window.history.pushState(null, "", nextUrl);
        }
        return next;
      });
    },
    [],
  );

  return { filters, setFilters };
}

