import type { QuotaIngestResponse, QuotaSnapshot } from "@tokenviewer/core";

export const COPILOT_INTERNAL_USER_URL = "https://api.github.com/copilot_internal/user";
export const COPILOT_HEADERS = {
  "editor-version": "vscode/1.99.0",
  "editor-plugin-version": "copilot-chat/0.25.0",
  "user-agent": "GithubCopilot/1.0",
  "x-github-api-version": "2022-11-28",
} as const;

export class CopilotAuthError extends Error {}

export async function fetchCopilotQuotaSnapshot(
  token: string,
  options: { fetcher?: typeof fetch; now?: Date } = {},
): Promise<QuotaSnapshot> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(COPILOT_INTERNAL_USER_URL, {
    headers: {
      ...COPILOT_HEADERS,
      accept: "application/json",
      authorization: `token ${token}`,
    },
  });

  if (response.status === 401) {
    throw new CopilotAuthError("GitHub Copilot token invalido; re-ejecuta tokenviewer-collector copilot login");
  }
  if (!response.ok) {
    throw new Error(`GitHub Copilot quota failed with HTTP ${response.status}`);
  }

  const raw = (await response.json()) as Record<string, unknown>;
  return {
    provider: "copilot",
    takenAt: (options.now ?? new Date()).toISOString(),
    percentUsed: quotaPercent(raw),
    plan: stringValue(raw["plan"]) ?? stringValue(raw["sku"]) ?? stringValue(recordValue(raw["copilot_plan"])?.["name"]),
    resetsAt: resetValue(raw),
    raw: ensureLogin(raw),
  };
}

export async function sendQuotaSnapshot(options: {
  serverUrl: string;
  machineToken: string;
  snapshot: QuotaSnapshot;
  fetcher?: typeof fetch;
}): Promise<QuotaIngestResponse> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(`${options.serverUrl.replace(/\/+$/, "")}/api/v1/ingest-quota`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.machineToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ snapshot: options.snapshot }),
  });

  if (!response.ok) {
    throw new Error(`quota ingest failed with HTTP ${response.status}`);
  }
  return (await response.json()) as QuotaIngestResponse;
}

export async function collectAndSendCopilotQuota(options: {
  token?: string;
  serverUrl?: string;
  machineToken?: string;
  warnings: string[];
  fetcher?: typeof fetch;
}): Promise<QuotaIngestResponse | undefined> {
  if (!options.token || !options.serverUrl || !options.machineToken) {
    return undefined;
  }

  try {
    const snapshot = await fetchCopilotQuotaSnapshot(options.token, { fetcher: options.fetcher });
    return await sendQuotaSnapshot({
      serverUrl: options.serverUrl,
      machineToken: options.machineToken,
      snapshot,
      fetcher: options.fetcher,
    });
  } catch (error) {
    if (error instanceof CopilotAuthError) {
      options.warnings.push(error.message);
    } else {
      options.warnings.push(`copilot: ${(error as Error).message}`);
    }
    return undefined;
  }
}

function quotaPercent(raw: Record<string, unknown>): number | undefined {
  return (
    percentFromWindow(recordValue(recordValue(raw["quota_snapshots"])?.["premium_interactions"])) ??
    percentFromWindow(recordValue(recordValue(raw["quota_snapshots"])?.["premium_requests"])) ??
    percentFromWindow(recordValue(raw["premium_interactions"])) ??
    percentFromWindow(recordValue(raw["premium_requests"])) ??
    percentFromWindow(recordValue(recordValue(raw["quota_snapshots"])?.["chat"])) ??
    percentFromWindow(recordValue(raw["chat"]))
  );
}

function percentFromWindow(value: Record<string, unknown> | null): number | undefined {
  const percent = numberValue(value?.["percent_used"]) ?? numberValue(value?.["percentUsed"]);
  if (percent === undefined) return undefined;
  return Math.max(0, Math.min(100, percent));
}

function resetValue(raw: Record<string, unknown>): string | undefined {
  return (
    dateString(raw["resets_at"]) ??
    dateString(raw["reset_at"]) ??
    dateString(recordValue(raw["quota_snapshots"])?.["resets_at"]) ??
    dateString(recordValue(raw["premium_interactions"])?.["resets_at"])
  );
}

function ensureLogin(raw: Record<string, unknown>): Record<string, unknown> {
  if (stringValue(raw["login"])) {
    return raw;
  }
  const nestedLogin =
    stringValue(recordValue(raw["user"])?.["login"]) ??
    stringValue(recordValue(raw["github"])?.["login"]) ??
    stringValue(recordValue(raw["viewer"])?.["login"]);
  return nestedLogin ? { ...raw, login: nestedLogin } : raw;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function dateString(value: unknown): string | undefined {
  const text = stringValue(value);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}
