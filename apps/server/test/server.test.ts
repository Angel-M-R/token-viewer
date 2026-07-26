import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openMemoryDb } from "../src/db/client.js";

const adminToken = "admin-secret";

describe("server API", () => {
  it("registers machines, stores only token hashes, rotates tokens, and lists without secrets", async () => {
    const fixture = createFixture();
    const first = await registerMachine(fixture.app, "macbook", "darwin");
    expect(first.machineToken).toMatch(/^tv_[a-f0-9]{64}$/);

    const stored = fixture.db.sqlite
      .prepare("SELECT token_hash FROM machines WHERE name = ?")
      .get("macbook") as { token_hash: string };
    expect(stored.token_hash).toHaveLength(64);
    expect(stored.token_hash).not.toBe(first.machineToken);

    const rotated = await registerMachine(fixture.app, "macbook", "darwin");
    expect(rotated.machineToken).not.toBe(first.machineToken);

    const oldTokenResponse = await fixture.app.request("/api/v1/ingest", {
      method: "POST",
      headers: auth(first.machineToken),
      body: JSON.stringify({ records: [] }),
    });
    expect(oldTokenResponse.status).toBe(401);

    const list = await fixture.app.request("/api/v1/machines", {
      headers: auth(adminToken),
    });
    expect(list.status).toBe(200);
    const body = await list.json();
    expect(JSON.stringify(body)).not.toContain("token_hash");
    expect(JSON.stringify(body)).not.toContain(rotated.machineToken);
  });

  it("rejects machine registration without admin auth", async () => {
    const fixture = createFixture();
    const response = await fixture.app.request("/api/v1/machines/register", {
      method: "POST",
      body: JSON.stringify({ name: "macbook" }),
    });
    expect(response.status).toBe(401);
    expect(countRows(fixture.db, "machines")).toBe(0);
  });

  it("ingests idempotently with gzip and per-machine record_hash uniqueness", async () => {
    const fixture = createFixture();
    seedPricing(fixture.db);
    const first = await registerMachine(fixture.app, "one", "darwin");
    const second = await registerMachine(fixture.app, "two", "linux");
    const records = [record("a".repeat(64)), record("b".repeat(64))];

    expect(await ingest(fixture.app, first.machineToken, records)).toEqual({
      accepted: 2,
      duplicates: 0,
    });
    expect(await ingest(fixture.app, first.machineToken, records)).toEqual({
      accepted: 0,
      duplicates: 2,
    });
    expect(await ingest(fixture.app, first.machineToken, [records[0]!, record("c".repeat(64))])).toEqual({
      accepted: 1,
      duplicates: 1,
    });
    expect(await ingest(fixture.app, second.machineToken, [records[0]!])).toEqual({
      accepted: 1,
      duplicates: 0,
    });
    expect(countRows(fixture.db, "usage_records")).toBe(4);

    const invalidToken = await fixture.app.request("/api/v1/ingest", {
      method: "POST",
      headers: auth("tv_deadbeef"),
      body: JSON.stringify({ records }),
    });
    expect(invalidToken.status).toBe(401);
    expect(countRows(fixture.db, "usage_records")).toBe(4);

    const invalidBody = await fixture.app.request("/api/v1/ingest", {
      method: "POST",
      headers: auth(first.machineToken),
      body: JSON.stringify({ records: [{ bad: true }] }),
    });
    expect(invalidBody.status).toBe(400);
    expect(countRows(fixture.db, "usage_records")).toBe(4);
  });

  it("stores catalog pricing, unknown pricing, stored billed cost, and reprices", async () => {
    const fixture = createFixture();
    seedPricing(fixture.db, 10);
    const machine = await registerMachine(fixture.app, "one", "darwin");
    await ingest(fixture.app, machine.machineToken, [
      record("a".repeat(64), { provider: "openai", model: "gpt-test", inputTokens: 1_000_000 }),
      record("b".repeat(64), { provider: "unknown", model: "unknown-model" }),
      record("c".repeat(64), { provider: "unknown", model: "opencode-model", billedCost: 0.25 }),
    ]);

    const rows = fixture.db.sqlite
      .prepare("SELECT record_hash, cost_usd, pricing_source, billed_cost_usd FROM usage_records ORDER BY record_hash")
      .all() as { record_hash: string; cost_usd: number | null; pricing_source: string; billed_cost_usd: number | null }[];
    expect(rows[0]?.cost_usd).toBeCloseTo(10.000004);
    expect(rows[0]?.pricing_source).toBe("catalog");
    expect(rows[1]).toMatchObject({ cost_usd: null, pricing_source: "unknown" });
    expect(rows[2]).toMatchObject({ cost_usd: null, pricing_source: "stored", billed_cost_usd: 0.25 });

    seedPricing(fixture.db, 20);
    const reprice = await fixture.app.request("/api/v1/admin/reprice", {
      method: "POST",
      headers: auth(adminToken),
    });
    expect(reprice.status).toBe(200);
    const updated = fixture.db.sqlite
      .prepare("SELECT cost_usd, billed_cost_usd FROM usage_records WHERE record_hash = ?")
      .get("a".repeat(64)) as { cost_usd: number; billed_cost_usd: number | null };
    expect(updated.cost_usd).toBeCloseTo(20.000004);
    expect(updated.billed_cost_usd).toBeNull();
  });

  it("serves stats, heatmap timezone conversion, records pagination, and dashboard auth", async () => {
    const fixture = createFixture({ dashboardToken: "dash" });
    seedPricing(fixture.db);
    const machine = await registerMachine(fixture.app, "macbook", "darwin");
    await ingest(fixture.app, machine.machineToken, [
      record("a".repeat(64), {
        agent: "claude",
        timestamp: "2026-07-05T23:30:00.000Z",
        inputTokens: 10,
        outputTokens: 5,
      }),
      record("b".repeat(64), {
        agent: "codex",
        timestamp: "2026-07-06T01:00:00.000Z",
        inputTokens: 1,
        outputTokens: 1,
        provider: "unknown",
        model: "unknown",
      }),
    ]);

    const unauthorized = await fixture.app.request("/api/v1/stats/summary");
    expect(unauthorized.status).toBe(401);

    const summary = await json(fixture.app.request("/api/v1/stats/summary", { headers: auth("dash") }));
    expect(summary.requests).toBe(2);
    expect(summary.unpricedRequests).toBe(1);

    const dashboardMachines = await fixture.app.request("/api/v1/machines", { headers: auth("dash") });
    expect(dashboardMachines.status).toBe(200);

    const daily = await json(
      fixture.app.request("/api/v1/stats/daily?agent=claude&groupBy=agent", {
        headers: auth("dash"),
      }),
    );
    expect(daily.rows).toHaveLength(1);
    expect(daily.rows[0].group).toBe("claude");

    const sameDay = await json(
      fixture.app.request("/api/v1/stats/summary?from=2026-07-06&to=2026-07-06", {
        headers: auth("dash"),
      }),
    );
    expect(sameDay.requests).toBe(1);

    const empty = await json(
      fixture.app.request("/api/v1/stats/summary?from=2026-07-01&to=2026-07-01", {
        headers: auth("dash"),
      }),
    );
    expect(empty.unpricedRequests).toBe(0);

    const heatmap = await json(
      fixture.app.request("/api/v1/stats/heatmap?metric=requests&tz=Europe/Madrid", {
        headers: auth("dash"),
      }),
    );
    expect(heatmap.matrix[1][1]).toBe(1);

    const invalidTz = await fixture.app.request("/api/v1/stats/heatmap?tz=Marte/Olympus", {
      headers: auth("dash"),
    });
    expect(invalidTz.status).toBe(400);

    const page1 = await json(
      fixture.app.request("/api/v1/records?limit=1", {
        headers: auth("dash"),
      }),
    );
    expect(page1.rows).toHaveLength(1);
    expect(page1.nextCursor).toBeTruthy();
    const page2 = await json(
      fixture.app.request(`/api/v1/records?limit=1&cursor=${page1.nextCursor}`, {
        headers: auth("dash"),
      }),
    );
    expect(page2.rows).toHaveLength(1);
    expect(page2.rows[0].id).not.toBe(page1.rows[0].id);
  });

  it("ingests and reads quota snapshots with machine dedup and account grouping", async () => {
    const fixture = createFixture({ dashboardToken: "dash" });
    const first = await registerMachine(fixture.app, "one", "darwin");
    const second = await registerMachine(fixture.app, "two", "linux");
    const third = await registerMachine(fixture.app, "three", "linux");
    const oldTakenAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const nowTakenAt = new Date().toISOString();

    const missingAuth = await fixture.app.request("/api/v1/ingest-quota", {
      method: "POST",
      body: JSON.stringify({ snapshot: quotaSnapshot(nowTakenAt, "octocat") }),
    });
    expect(missingAuth.status).toBe(401);

    const invalidBody = await fixture.app.request("/api/v1/ingest-quota", {
      method: "POST",
      headers: { ...auth(first.machineToken), "content-type": "application/json" },
      body: JSON.stringify({ snapshot: { provider: "copilot" } }),
    });
    expect(invalidBody.status).toBe(400);

    expect(await ingestQuota(fixture.app, first.machineToken, quotaSnapshot(oldTakenAt, "octocat", 10))).toEqual({
      accepted: true,
    });
    expect(await ingestQuota(fixture.app, first.machineToken, quotaSnapshot(nowTakenAt, "octocat", 20))).toEqual({
      accepted: true,
    });
    expect(await ingestQuota(fixture.app, first.machineToken, quotaSnapshot(nowTakenAt, "octocat", 21))).toEqual({
      accepted: false,
      reason: "duplicate",
    });
    expect(await ingestQuota(fixture.app, second.machineToken, quotaSnapshot(nowTakenAt, "octocat", 22))).toEqual({
      accepted: true,
    });
    expect(await ingestQuota(fixture.app, third.machineToken, quotaSnapshot(nowTakenAt, "mona", 30))).toEqual({
      accepted: true,
    });

    const read = await json(
      fixture.app.request("/api/v1/quota-snapshots?provider=copilot", {
        headers: auth("dash"),
      }),
    );
    expect(read.accounts.map((account: { account: string }) => account.account).sort()).toEqual([
      "mona",
      "octocat",
    ]);
    const octocat = read.accounts.find((account: { account: string }) => account.account === "octocat");
    expect(octocat.series).toHaveLength(2);
    expect(octocat.latest.percentUsed).toBe(22);

    const empty = await json(
      fixture.app.request("/api/v1/quota-snapshots?provider=copilot&from=2099-01-01&to=2099-01-01", {
        headers: auth("dash"),
      }),
    );
    expect(empty.accounts).toEqual([]);
  });

  it("health works and static root reports missing dashboard", async () => {
    const fixture = createFixture();
    expect((await fixture.app.request("/health")).status).toBe(200);
    const root = await fixture.app.request("/");
    expect(root.status).toBe(404);
    expect(await root.text()).toContain("dashboard build not found");
  });
});

function createFixture(overrides: { dashboardToken?: string } = {}) {
  const db = openMemoryDb();
  const app = createApp({
    db,
    config: {
      adminToken,
      dashboardToken: overrides.dashboardToken,
      port: 8484,
      dbPath: ":memory:",
      webDist: "/tmp/does-not-exist-tokenviewer-web",
    },
  });
  return { db, app };
}

async function registerMachine(app: ReturnType<typeof createApp>, name: string, os: string) {
  const response = await app.request("/api/v1/machines/register", {
    method: "POST",
    headers: { ...auth(adminToken), "content-type": "application/json" },
    body: JSON.stringify({ name, os }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as { id: number; name: string; os: string; machineToken: string };
}

async function ingest(app: ReturnType<typeof createApp>, token: string, records: unknown[]) {
  const response = await app.request("/api/v1/ingest", {
    method: "POST",
    headers: {
      ...auth(token),
      "content-type": "application/json",
      "content-encoding": "gzip",
    },
    body: gzipSync(Buffer.from(JSON.stringify({ records }))),
  });
  expect(response.status).toBe(200);
  return response.json() as Promise<{ accepted: number; duplicates: number }>;
}

async function ingestQuota(app: ReturnType<typeof createApp>, token: string, snapshot: unknown) {
  const response = await app.request("/api/v1/ingest-quota", {
    method: "POST",
    headers: {
      ...auth(token),
      "content-type": "application/json",
    },
    body: JSON.stringify({ snapshot }),
  });
  expect(response.status).toBe(200);
  return response.json() as Promise<{ accepted: boolean; reason?: string }>;
}

function record(hash: string, overrides: Record<string, unknown> = {}) {
  return {
    agent: "claude",
    provider: "openai",
    model: "gpt-test",
    timestamp: "2026-07-05T10:00:00.000Z",
    inputTokens: 1,
    outputTokens: 2,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    sourceFile: "/tmp/source.jsonl",
    recordHash: hash,
    ...overrides,
  };
}

function quotaSnapshot(takenAt: string, login: string, percentUsed = 42) {
  return {
    provider: "copilot",
    takenAt,
    percentUsed,
    plan: "Pro",
    resetsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    raw: {
      login,
      quota_snapshots: {
        premium_interactions: {
          percent_used: percentUsed,
        },
      },
    },
  };
}

function seedPricing(db: ReturnType<typeof openMemoryDb>, inputRate = 1) {
  const payload = {
    openai: {
      models: {
        "gpt-test": {
          cost: {
            input: inputRate,
            output: 2,
            cache_read: 0.5,
            cache_write: 1,
          },
        },
      },
    },
  };
  db.sqlite
    .prepare(
      "INSERT INTO pricing_catalog (id, fetched_at, payload) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET fetched_at = excluded.fetched_at, payload = excluded.payload",
    )
    .run(new Date().toISOString(), JSON.stringify(payload));
}

function countRows(db: ReturnType<typeof openMemoryDb>, table: string): number {
  const row = db.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
  return Number(row.count);
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function json(responsePromise: Promise<Response>) {
  const response = await responsePromise;
  expect(response.status).toBe(200);
  return response.json() as Promise<any>;
}
