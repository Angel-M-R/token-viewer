import { describe, expect, it, vi } from "vitest";
import { pollCopilotAccessToken, requestCopilotDeviceCode, type DeviceCode } from "../src/copilot-auth.js";

describe("Copilot device flow", () => {
  it("requests a GitHub device code with the VS Code client id", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const device = await requestCopilotDeviceCode(async (url, init) => {
      calls.push({ url: String(url), init });
      return Response.json({
        device_code: "device",
        user_code: "ABCD-EFGH",
        verification_uri: "https://github.com/login/device",
        expires_in: 900,
        interval: 5,
      });
    });

    expect(device.userCode).toBe("ABCD-EFGH");
    expect(String(calls[0]?.init?.body)).toContain("client_id=Iv1.b507a08c87ecfe98");
    expect(String(calls[0]?.init?.body)).toContain("scope=read%3Auser");
  });

  it("continues on authorization_pending and succeeds", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: "authorization_pending" }))
      .mockResolvedValueOnce(Response.json({ access_token: "gho_token" }));

    await expect(pollCopilotAccessToken(device(), { fetcher, sleep: async () => {} })).resolves.toBe("gho_token");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("adds five seconds on slow_down", async () => {
    const sleeps: number[] = [];
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: "slow_down" }))
      .mockResolvedValueOnce(Response.json({ access_token: "gho_token" }));

    await pollCopilotAccessToken(device(), {
      fetcher,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    expect(sleeps).toEqual([5000, 10000]);
  });

  it("errors clearly on expired_token", async () => {
    await expect(
      pollCopilotAccessToken(device(), {
        fetcher: async () => Response.json({ error: "expired_token" }),
        sleep: async () => {},
      }),
    ).rejects.toThrow("re-ejecuta copilot login");
  });
});

function device(): DeviceCode {
  return {
    deviceCode: "device",
    userCode: "ABCD-EFGH",
    verificationUri: "https://github.com/login/device",
    expiresIn: 900,
    interval: 5,
  };
}

