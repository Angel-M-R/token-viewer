import { describe, expect, it } from "vitest";
import { aggregateDailyTotals, movingAverage } from "./dailyMath";

describe("daily math", () => {
  it("calculates a partial-window moving average", () => {
    expect(movingAverage([7, 14, 21], 7)).toEqual([7, 10.5, 14]);
  });

  it("aggregates multiple grouped rows per day", () => {
    expect(
      aggregateDailyTotals(
        [
          row("2026-01-01", "codex", 10),
          row("2026-01-01", "claude", 20),
          row("2026-01-02", "codex", 5),
        ],
        "tokens",
      ),
    ).toEqual([
      { day: "2026-01-01", value: 30 },
      { day: "2026-01-02", value: 5 },
    ]);
  });
});

function row(day: string, group: string, inputTokens: number) {
  return {
    day,
    group,
    requests: 1,
    inputTokens,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    estimatedCost: 0,
    billedCost: 0,
  };
}

