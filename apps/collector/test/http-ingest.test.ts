import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { HttpIngestClient, chunkRecords } from "../src/index.js";

describe("HttpIngestClient", () => {
  it("sends records in gzip batches of at most 1000", async () => {
    const calls: RequestInit[] = [];
    const client = new HttpIngestClient({
      serverUrl: "http://server.local/",
      machineToken: "tv_token",
      fetcher: async (_url, init) => {
        calls.push(init ?? {});
        return Response.json({ accepted: 1, duplicates: 0 });
      },
    });
    const records = Array.from({ length: 2500 }, (_, index) => record(String(index).padStart(64, "a")));

    const result = await client.ingest({
      machineName: "machine",
      machineToken: "tv_token",
      records,
    });

    expect(result).toEqual({ accepted: 3, duplicates: 0 });
    expect(calls).toHaveLength(3);
    expect(calls.map((call) => JSON.parse(gunzipSync(call.body as Buffer).toString("utf-8")).records.length)).toEqual([
      1000,
      1000,
      500,
    ]);
    expect(calls[0]?.headers).toMatchObject({
      authorization: "Bearer tv_token",
      "content-encoding": "gzip",
    });
  });

  it("throws on non-2xx so callers do not advance cursors", async () => {
    const client = new HttpIngestClient({
      serverUrl: "http://server.local",
      machineToken: "tv_token",
      fetcher: async () => new Response("no", { status: 503 }),
    });

    await expect(
      client.ingest({ machineName: "machine", machineToken: "tv_token", records: [record("a".repeat(64))] }),
    ).rejects.toThrow("HTTP 503");
  });

  it("chunks records deterministically", () => {
    expect(chunkRecords([record("a".repeat(64)), record("b".repeat(64)), record("c".repeat(64))], 2)).toHaveLength(2);
  });
});

function record(hash: string) {
  return {
    agent: "claude",
    timestamp: "2026-07-05T10:00:00.000Z",
    inputTokens: 1,
    outputTokens: 1,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    sourceFile: "/tmp/source.jsonl",
    recordHash: hash.slice(0, 64),
  };
}
