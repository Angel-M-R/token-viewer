import { describe, expect, it } from "vitest";
import { allAdapters, createAdapter } from "../src/index.js";

describe("adapter registry", () => {
  it("contains exactly the seven phase-1 adapters", () => {
    expect(allAdapters().map((adapter) => adapter.name)).toEqual([
      "claude",
      "codex",
      "cursor",
      "opencode",
      "amp",
      "pi",
      "t3code",
    ]);
  });

  it("rejects excluded or unknown adapters", () => {
    expect(() => createAdapter("zed")).toThrow(/available: claude, codex, cursor, opencode, amp, pi, t3code/);
    expect(() => createAdapter("cline")).toThrow(/unknown adapter/);
  });
});
