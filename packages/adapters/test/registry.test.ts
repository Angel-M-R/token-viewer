import { describe, expect, it } from "vitest";
import { allAdapters, createAdapter } from "../src/index.js";

describe("adapter registry", () => {
  it("collects every adapter except the opt-in t3code by default", () => {
    expect(allAdapters().map((adapter) => adapter.name)).toEqual([
      "claude",
      "codex",
      "cursor",
      "opencode",
      "amp",
      "pi",
      "omp",
    ]);
  });

  it("still creates t3code when named explicitly", () => {
    expect(createAdapter("t3code").name).toBe("t3code");
  });

  it("rejects excluded or unknown adapters", () => {
    expect(() => createAdapter("zed")).toThrow(/available: claude, codex, cursor, opencode, amp, pi, omp, t3code/);
    expect(() => createAdapter("cline")).toThrow(/unknown adapter/);
  });
});
