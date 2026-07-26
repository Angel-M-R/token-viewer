import { describe, expect, it } from "vitest";
import { formatTokens, formatUsd, totalTokens } from "./format";

describe("format helpers", () => {
  it("formats compact tokens and USD", () => {
    expect(formatTokens(1_234_567)).toBe("1.2M");
    expect(formatUsd(12.3456)).toBe("$12.35");
  });

  it("sums all token buckets", () => {
    expect(
      totalTokens({
        inputTokens: 1,
        outputTokens: 2,
        reasoningTokens: 3,
        cacheReadTokens: 4,
        cacheWriteTokens: 5,
      }),
    ).toBe(15);
  });
});

