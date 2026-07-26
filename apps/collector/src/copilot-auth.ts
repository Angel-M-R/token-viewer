export const GITHUB_DEVICE_CLIENT_ID = "Iv1.b507a08c87ecfe98";
export const GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code";
export const GITHUB_ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
export const GITHUB_USER_URL = "https://api.github.com/user";

export interface DeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export interface PollOptions {
  fetcher?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export async function requestCopilotDeviceCode(fetcher: typeof fetch = fetch): Promise<DeviceCode> {
  const response = await fetcher(GITHUB_DEVICE_CODE_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: GITHUB_DEVICE_CLIENT_ID,
      scope: "read:user",
    }),
  });
  if (!response.ok) {
    throw new Error(`GitHub device code failed with HTTP ${response.status}`);
  }
  const body = (await response.json()) as Record<string, unknown>;
  return {
    deviceCode: stringField(body, "device_code"),
    userCode: stringField(body, "user_code"),
    verificationUri: stringField(body, "verification_uri"),
    expiresIn: numberField(body, "expires_in"),
    interval: numberField(body, "interval", 5),
  };
}

export async function pollCopilotAccessToken(device: DeviceCode, options: PollOptions = {}): Promise<string> {
  const fetcher = options.fetcher ?? fetch;
  const sleep = options.sleep ?? delay;
  const now = options.now ?? Date.now;
  const expiresAt = now() + device.expiresIn * 1000;
  let intervalMs = device.interval * 1000;

  while (now() < expiresAt) {
    await sleep(intervalMs);
    const response = await fetcher(GITHUB_ACCESS_TOKEN_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: GITHUB_DEVICE_CLIENT_ID,
        device_code: device.deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });
    const body = (await response.json()) as Record<string, unknown>;
    const accessToken = stringValue(body["access_token"]);
    if (response.ok && accessToken) {
      return accessToken;
    }

    const error = stringValue(body["error"]);
    if (error === "authorization_pending") {
      continue;
    }
    if (error === "slow_down") {
      intervalMs += 5_000;
      continue;
    }
    if (error === "expired_token") {
      throw new Error("codigo de Copilot expirado; re-ejecuta copilot login");
    }
    throw new Error(`GitHub device flow failed: ${error ?? `HTTP ${response.status}`}`);
  }

  throw new Error("codigo de Copilot expirado; re-ejecuta copilot login");
}

export async function fetchGitHubUserLogin(token: string, fetcher: typeof fetch = fetch): Promise<string | undefined> {
  const response = await fetcher(GITHUB_USER_URL, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!response.ok) {
    return undefined;
  }
  const body = (await response.json()) as Record<string, unknown>;
  return stringValue(body["login"]);
}

function stringField(body: Record<string, unknown>, field: string): string {
  const value = stringValue(body[field]);
  if (!value) throw new Error(`GitHub response missing ${field}`);
  return value;
}

function numberField(body: Record<string, unknown>, field: string, fallback?: number): number {
  const value = body[field];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`GitHub response missing ${field}`);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

