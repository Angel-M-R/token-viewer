import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { allAdapters, createAdapter } from "@tokenviewer/adapters";
import {
  type Adapter,
  type AdapterName,
  type FileCursorMap,
  type UsageOptions,
  type UsageRecord,
} from "@tokenviewer/core";
import { loadCollectorConfig } from "./config.js";
import { collectAndSendCopilotQuota } from "./copilot-quota.js";
import { DryRunIngestClient, emptyFileStats, type DryRunSummary } from "./dry-run.js";
import { HttpIngestClient } from "./http-ingest.js";
import { loadCollectorState, saveCollectorState, type CollectorState } from "./state.js";

export interface RunOptions {
  dryRun: boolean;
  full?: boolean;
  out?: string;
  agents?: string[];
}

export interface StatusResult {
  agents: { name: string; detected: boolean }[];
  lastRunAt?: string;
  cursorFiles: number;
  warnings: string[];
}

const SQLITE_ADAPTERS = new Set<string>(["cursor", "opencode", "t3code"]);

export async function runCollector(options: RunOptions): Promise<DryRunSummary> {
  const config = await loadCollectorConfig();
  if (!options.dryRun && (!config.serverUrl || !config.machineToken)) {
    throw new Error("serverUrl y machineToken son obligatorios para enviar al servidor; ejecuta init");
  }

  const stateResult = await loadCollectorState();
  const warnings = stateResult.warning ? [stateResult.warning] : [];
  const selectedAdapters = await selectAdapters(options.agents ?? config.agents);
  const newFiles: FileCursorMap = options.full ? {} : { ...stateResult.state.files };
  const fileStats = emptyFileStats();
  const dryRunClient = new DryRunIngestClient();
  const httpClient =
    !options.dryRun && config.serverUrl && config.machineToken
      ? new HttpIngestClient({ serverUrl: config.serverUrl, machineToken: config.machineToken })
      : null;
  const records: UsageRecord[] = [];

  for (const adapter of selectedAdapters) {
    const adapterOptions = usageOptionsForAdapter(adapter, stateResult.state, newFiles, fileStats, warnings, options.full);

    for await (const record of adapter.usage(adapterOptions)) {
      records.push(record);
    }
  }

  const ingestResult = options.dryRun
    ? await dryRunClient.ingest({
        machineName: config.machineName,
        machineToken: config.machineToken ?? "dry-run",
        records,
      })
    : await httpClient!.ingest({
        machineName: config.machineName,
        machineToken: config.machineToken!,
        records,
      });
  const quota = !options.dryRun
    ? await collectAndSendCopilotQuota({
        token: config.copilotToken,
        serverUrl: config.serverUrl,
        machineToken: config.machineToken,
        warnings,
      })
    : undefined;
  const summary = options.dryRun
    ? dryRunClient.summary(fileStats, warnings)
    : {
        ...dryRunClient.summary(fileStats, warnings),
        dryRun: false,
        totals: { ...dryRunClient.summary(fileStats, warnings).totals, records: records.length },
        ingest: ingestResult,
        quota,
      };
  if (options.out) {
    await mkdir(dirname(options.out), { recursive: true });
    await writeFile(options.out, `${JSON.stringify(summary, null, 2)}\n`, "utf-8");
  }

  await saveCollectorState({
    schemaVersion: 1,
    files: newFiles,
    lastRunAt: summary.generatedAt,
  });

  return summary;
}

export async function statusCollector(): Promise<StatusResult> {
  const stateResult = await loadCollectorState();
  const adapters = allAdapters();
  const agents = [];

  for (const adapter of adapters) {
    agents.push({ name: adapter.name, detected: await adapter.detect() });
  }

  return {
    agents,
    lastRunAt: stateResult.state.lastRunAt,
    cursorFiles: Object.keys(stateResult.state.files).length,
    warnings: stateResult.warning ? [stateResult.warning] : [],
  };
}

async function selectAdapters(selected?: string[]): Promise<Adapter[]> {
  if (selected && selected.length > 0) {
    return selected.map((name) => createAdapter(name));
  }

  const detected: Adapter[] = [];
  for (const adapter of allAdapters()) {
    if (await adapter.detect()) {
      detected.push(adapter);
    }
  }
  return detected;
}

function usageOptionsForAdapter(
  adapter: Adapter,
  previousState: CollectorState,
  newFiles: FileCursorMap,
  fileStats: ReturnType<typeof emptyFileStats>,
  warnings: string[],
  full: boolean | undefined,
): UsageOptions {
  const scanned = new Set<string>();
  fileStats.scanned.set(adapter.name, scanned);

  return {
    cursors: full ? {} : previousState.files,
    full,
    since: sqliteSince(adapter.name, previousState.lastRunAt, full),
    onFileComplete(file, cursor) {
      scanned.add(file);
      newFiles[file] = cursor;
    },
    onFileSkipped(_file, reason) {
      if (reason !== "unchanged") {
        warnings.push(`${adapter.name}: source skipped (${reason})`);
      }
      fileStats.omitted.set(adapter.name, (fileStats.omitted.get(adapter.name) ?? 0) + 1);
    },
    onWarning(message) {
      warnings.push(`${adapter.name}: ${message}`);
    },
  };
}

function sqliteSince(
  adapterName: AdapterName | string,
  lastRunAt: string | undefined,
  full: boolean | undefined,
): Date | undefined {
  if (full || !lastRunAt || !SQLITE_ADAPTERS.has(adapterName)) {
    return undefined;
  }

  const lastRun = new Date(lastRunAt);
  if (!Number.isFinite(lastRun.getTime())) {
    return undefined;
  }

  return new Date(lastRun.getTime() - 24 * 60 * 60 * 1000);
}
