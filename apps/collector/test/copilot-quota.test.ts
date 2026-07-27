import { describe, expect, it, vi } from "vitest";
import { collectCopilotQuota, fetchCopilotQuotaSample } from "../src/copilot-quota.js";

describe("Copilot quota collection", () => {
  it("sanitizes a complete response", async () => {
    const sample = await fetchCopilotQuotaSample("gho_token", {
      now: new Date("2026-07-05T10:00:00.000Z"),
      fetcher: async () =>
        Response.json({
          login: "octocat",
          plan: "Pro",
          resets_at: "2026-08-01T00:00:00Z",
          quota_snapshots: { premium_requests: { percent_used: 67 } },
          payload: { private: true },
        }),
    });

    expect(sample).toEqual({
      provider: "copilot",
      takenAt: "2026-07-05T10:00:00.000Z",
      percentUsed: 67,
      plan: "Pro",
      resetsAt: "2026-08-01T00:00:00.000Z",
    });
  });

  it("accepts a partial response and falls back to chat", async () => {
    const sample = await fetchCopilotQuotaSample("gho_token", {
      now: new Date("2026-07-05T10:00:00.000Z"),
      fetcher: async () => Response.json({ quota_snapshots: { chat: { percent_used: 12 } } }),
    });

    expect(sample).toEqual({
      provider: "copilot",
      takenAt: "2026-07-05T10:00:00.000Z",
      percentUsed: 12,
    });
  });

  it("discards unknown response fields", async () => {
    const sample = await fetchCopilotQuotaSample("gho_token", {
      now: new Date("2026-07-05T10:00:00.000Z"),
      fetcher: async () => Response.json({ future_account_id: "private", future_payload: { raw: true } }),
    });

    expect(sample).toEqual({ provider: "copilot", takenAt: "2026-07-05T10:00:00.000Z" });
    expect(JSON.stringify(sample)).not.toMatch(/account|payload|private|raw/);
  });

  it("omits collection without a token", async () => {
    const warnings: string[] = [];
    const fetcher = vi.fn();
    await expect(collectCopilotQuota({ warnings, fetcher })).resolves.toBeUndefined();
    expect(warnings).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("warns on a revoked token and continues", async () => {
    const warnings: string[] = [];
    await expect(
      collectCopilotQuota({
        token: "gho_token",
        warnings,
        fetcher: async () => new Response("no", { status: 401 }),
      }),
    ).resolves.toBeUndefined();
    expect(warnings.join("\n")).toContain("copilot login");
  });

  it("warns on a network failure and continues", async () => {
    const warnings: string[] = [];
    await expect(
      collectCopilotQuota({
        token: "gho_token",
        warnings,
        fetcher: async () => {
          throw new Error("network unavailable");
        },
      }),
    ).resolves.toBeUndefined();
    expect(warnings).toEqual(["copilot: network unavailable"]);
  });
});
