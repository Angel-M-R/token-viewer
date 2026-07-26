import type { IngestClient, IngestPayload, IngestResult, UsageRecord } from "@tokenviewer/core";

export interface TokenTotals {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  billedCost: number;
}

export interface AgentSummary extends TokenTotals {
  records: number;
  filesScanned: number;
  filesOmitted: number;
}

export interface DryRunSummary {
  dryRun: boolean;
  generatedAt: string;
  from?: string;
  to?: string;
  agents: Record<string, AgentSummary>;
  totals: AgentSummary;
  warnings: string[];
}

export interface FileStats {
  scanned: Map<string, Set<string>>;
  omitted: Map<string, number>;
}

export class DryRunIngestClient implements IngestClient {
  readonly records = new Map<string, UsageRecord>();

  async ingest(payload: IngestPayload): Promise<IngestResult> {
    let accepted = 0;
    let duplicates = 0;

    for (const record of payload.records) {
      if (this.records.has(record.recordHash)) {
        duplicates += 1;
        continue;
      }
      this.records.set(record.recordHash, record);
      accepted += 1;
    }

    return { accepted, duplicates };
  }

  summary(fileStats: FileStats, warnings: string[]): DryRunSummary {
    const agents: Record<string, AgentSummary> = {};
    let from: string | undefined;
    let to: string | undefined;

    for (const record of this.records.values()) {
      const summary = (agents[record.agent] ??= emptyAgentSummary());
      addRecord(summary, record);
      if (record.timestamp) {
        from = !from || record.timestamp < from ? record.timestamp : from;
        to = !to || record.timestamp > to ? record.timestamp : to;
      }
    }

    for (const [agent, files] of fileStats.scanned.entries()) {
      const summary = (agents[agent] ??= emptyAgentSummary());
      summary.filesScanned = files.size;
    }

    for (const [agent, omitted] of fileStats.omitted.entries()) {
      const summary = (agents[agent] ??= emptyAgentSummary());
      summary.filesOmitted = omitted;
    }

    const totals = emptyAgentSummary();
    for (const summary of Object.values(agents)) {
      totals.records += summary.records;
      totals.filesScanned += summary.filesScanned;
      totals.filesOmitted += summary.filesOmitted;
      totals.inputTokens += summary.inputTokens;
      totals.outputTokens += summary.outputTokens;
      totals.reasoningTokens += summary.reasoningTokens;
      totals.cacheReadTokens += summary.cacheReadTokens;
      totals.cacheWriteTokens += summary.cacheWriteTokens;
      totals.billedCost += summary.billedCost;
    }

    return {
      dryRun: true,
      generatedAt: new Date().toISOString(),
      from,
      to,
      agents,
      totals,
      warnings,
    };
  }
}

export function emptyFileStats(): FileStats {
  return {
    scanned: new Map(),
    omitted: new Map(),
  };
}

function emptyAgentSummary(): AgentSummary {
  return {
    records: 0,
    filesScanned: 0,
    filesOmitted: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    billedCost: 0,
  };
}

function addRecord(summary: AgentSummary, record: UsageRecord): void {
  summary.records += 1;
  summary.inputTokens += record.inputTokens;
  summary.outputTokens += record.outputTokens;
  summary.reasoningTokens += record.reasoningTokens;
  summary.cacheReadTokens += record.cacheReadTokens;
  summary.cacheWriteTokens += record.cacheWriteTokens;
  summary.billedCost += record.billedCost ?? 0;
}
