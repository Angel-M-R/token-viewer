import { afterEach, describe, expect, it, vi } from "vitest";
import { configureApiClient, fetchHeatmap } from "./client";

describe("api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the browser IANA timezone to the heatmap endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        metric: "tokens",
        tz: "Europe/Madrid",
        matrix: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)),
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    configureApiClient({ getToken: () => null, onUnauthorized: () => {} });

    await fetchHeatmap({}, "tokens", "Europe/Madrid");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/stats/heatmap?metric=tokens&tz=Europe%2FMadrid",
      expect.any(Object),
    );
  });
});

