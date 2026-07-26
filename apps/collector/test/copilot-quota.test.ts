import { describe, expect, it, vi } from "vitest";
import {
  collectAndSendCopilotQuota,
  fetchCopilotQuotaSnapshot,
  sendQuotaSnapshot,
} from "../src/copilot-quota.js";

describe("Copilot quota collection", () => {
  it("maps a complete Copilot response to a quota snapshot", async () => {
    const snapshot = await fetchCopilotQuotaSnapshot("gho_token", {
      now: new Date("2026-07-05T10:00:00.000Z"),
      fetcher: async () =>
        Response.json({
          login: "octocat",
          plan: "Pro",
          resets_at: "2026-08-01T00:00:00Z",
          quota_snapshots: {
            premium_interactions: { percent_used: 67 },
          },
          unknown: { still: "kept" },
        }),
    });

    expect(snapshot).toMatchObject({
      provider: "copilot",
      takenAt: "2026-07-05T10:00:00.000Z",
      percentUsed: 67,
      plan: "Pro",
      resetsAt: "2026-08-01T00:00:00.000Z",
      raw: { login: "octocat", unknown: { still: "kept" } },
    });
  });

  it("falls back to chat quota and accepts missing resets_at", async () => {
    const snapshot = await fetchCopilotQuotaSnapshot("gho_token", {
      fetcher: async () =>
        Response.json({
          user: { login: "octocat" },
          quota_snapshots: {
            chat: { percent_used: 12 },
          },
        }),
    });

    expect(snapshot.percentUsed).toBe(12);
    expect(snapshot.resetsAt).toBeUndefined();
    expect(snapshot.raw.login).toBe("octocat");
  });

  it("sends snapshots without leaking the GitHub token", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    await sendQuotaSnapshot({
      serverUrl: "http://server.local/",
      machineToken: "tv_machine",
      snapshot: {
        provider: "copilot",
        takenAt: "2026-07-05T10:00:00.000Z",
        raw: { login: "octocat" },
      },
      fetcher: async (url, init) => {
        calls.push({ url: String(url), init });
        return Response.json({ accepted: true });
      },
    });

    expect(calls[0]?.url).toBe("http://server.local/api/v1/ingest-quota");
    expect(calls[0]?.init?.headers).toMatchObject({ authorization: "Bearer tv_machine" });
    expect(calls[0]?.init?.body).not.toContain("gho_");
  });

  it("warns on 401 and continues", async () => {
    const warnings: string[] = [];
    const result = await collectAndSendCopilotQuota({
      token: "gho_token",
      serverUrl: "http://server.local",
      machineToken: "tv_machine",
      warnings,
      fetcher: async () => new Response("no", { status: 401 }),
    });

    expect(result).toBeUndefined();
    expect(warnings.join("\n")).toContain("copilot login");
  });

  it("treats an old server 404 as best-effort", async () => {
    const warnings: string[] = [];
    const result = await collectAndSendCopilotQuota({
      token: "gho_token",
      serverUrl: "http://server.local",
      machineToken: "tv_machine",
      warnings,
      fetcher: async (url) => {
        if (String(url) === "https://api.github.com/copilot_internal/user") {
          return Response.json({ login: "octocat", quota_snapshots: { chat: { percent_used: 5 } } });
        }
        return new Response("not found", { status: 404 });
      },
    });

    expect(result).toBeUndefined();
    expect(warnings.join("\n")).toContain("HTTP 404");
  });

  it("omits collection silently without a token", async () => {
    const warnings: string[] = [];
    const fetcher = vi.fn();
    await expect(
      collectAndSendCopilotQuota({
        serverUrl: "http://server.local",
        machineToken: "tv_machine",
        warnings,
        fetcher,
      }),
    ).resolves.toBeUndefined();
    expect(warnings).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
