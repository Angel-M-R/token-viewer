import { gzipSync } from "node:zlib";
import type { IngestClient, IngestPayload, IngestResult, UsageRecord } from "@tokenviewer/core";

export interface HttpIngestClientOptions {
  serverUrl: string;
  machineToken: string;
  fetcher?: typeof fetch;
}

export class HttpIngestClient implements IngestClient {
  private readonly serverUrl: string;
  private readonly machineToken: string;
  private readonly fetcher: typeof fetch;

  constructor(options: HttpIngestClientOptions) {
    this.serverUrl = options.serverUrl.replace(/\/+$/, "");
    this.machineToken = options.machineToken;
    this.fetcher = options.fetcher ?? fetch;
  }

  async ingest(payload: IngestPayload): Promise<IngestResult> {
    let accepted = 0;
    let duplicates = 0;

    for (const batch of chunkRecords(payload.records, 1000)) {
      const body = gzipSync(Buffer.from(JSON.stringify({ records: batch }), "utf-8"));
      const response = await this.fetcher(`${this.serverUrl}/api/v1/ingest`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.machineToken}`,
          "content-type": "application/json",
          "content-encoding": "gzip",
        },
        body,
      });

      if (!response.ok) {
        throw new Error(`ingest failed with HTTP ${response.status}`);
      }

      const parsed = (await response.json()) as IngestResult;
      accepted += parsed.accepted;
      duplicates += parsed.duplicates;
    }

    return { accepted, duplicates };
  }
}

export function chunkRecords(records: UsageRecord[], size: number): UsageRecord[][] {
  const chunks: UsageRecord[][] = [];
  for (let index = 0; index < records.length; index += size) {
    chunks.push(records.slice(index, index + size));
  }
  return chunks;
}
