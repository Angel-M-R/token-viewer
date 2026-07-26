import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useFilters } from "./useFilters";
import { parseFilters, serializeFilters } from "./url";

describe("URL filters", () => {
  it("reads repeated model params", () => {
    expect(parseFilters("?range=7d&model=gpt-5&model=claude-opus").models).toEqual([
      "gpt-5",
      "claude-opus",
    ]);
  });

  it("serializes selected values as repeated params", () => {
    const query = serializeFilters({
      range: "custom",
      from: "2026-01-01",
      to: "2026-01-31",
      machines: ["desktop"],
      agents: ["codex"],
      models: ["gpt-5", "claude-opus"],
      heatmapMetric: "cost",
      dailyGroupBy: "model",
      dailyMetric: "cost",
    });
    expect(query).toContain("model=gpt-5");
    expect(query).toContain("model=claude-opus");
    expect(query).toContain("from=2026-01-01");
  });

  it("updates state from URL changes and writes state to the URL", async () => {
    window.history.replaceState(null, "", "/?range=7d&model=gpt-5&model=opus");
    render(<FilterHarness />);

    expect(screen.getByTestId("range").textContent).toBe("7d");
    expect(screen.getByTestId("models").textContent).toBe("gpt-5,opus");

    await userEvent.click(screen.getByRole("button", { name: "Set models" }));
    expect(window.location.search).toContain("model=sonnet");
    expect(window.location.search).toContain("model=haiku");

    act(() => {
      window.history.pushState(null, "", "/?range=90d");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByTestId("range").textContent).toBe("90d");
  });
});

function FilterHarness() {
  const { filters, setFilters } = useFilters();
  return (
    <div>
      <span data-testid="range">{filters.range}</span>
      <span data-testid="models">{filters.models.join(",")}</span>
      <button type="button" onClick={() => setFilters({ models: ["sonnet", "haiku"] })}>
        Set models
      </button>
    </div>
  );
}
