import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { allAdapters, createAdapter } from "@tokenviewer/adapters";
import {
  createFilePricingCatalogCache,
  discoverAvailableSourceDates,
  generateDailySnapshots,
  loadPricingCatalog,
  planDailySnapshots,
  stateDir,
  validateSnapshotSet,
  type Adapter,
  type FileCursorMap,
  type PricingCatalog,
  type SnapshotTotals,
  type UsageRecord,
} from "@tokenviewer/core";
import { loadCollectorConfig } from "./config.js";
import { collectCopilotQuota } from "./copilot-quota.js";
import { summarizeSnapshots, type DayPreview } from "./dry-run.js";
import { publishSnapshots } from "./publisher.js";
import { loadCollectorState, saveCollectorState } from "./state.js";

const execFile = promisify(execFileCallback);

export interface RunOptions {
  dryRun: boolean;
  publish?: boolean;
  full?: boolean;
  out?: string;
  agents?: string[];
}

export interface CollectorDependencies {
  fetcher?: typeof fetch;
  now?: () => Date;
  pricing?: PricingCatalog;
}

export interface Coverage {
  from?: string;
  to?: string;
  dates: string[];
}

export interface CollectorRunSummary {
  dryRun: boolean;
  generatedAt: string;
  machine: string;
  sourceCoverage: Coverage;
  days: DayPreview[];
  totals: SnapshotTotals;
  writtenDates: readonly string[];
  unchangedDates: readonly string[];
  protectedClosedDates: readonly string[];
  duplicateRecords: number;
  skippedRecords: number;
  warnings: string[];
  publication?: {
    recoveredCommit?: string;
    commit?: string;
    published: boolean;
    pushAttempts: number;
  };
}

export interface StatusResult {
  identity: string;
  agents: { name: string; detected: boolean }[];
  sourceCoverage: Coverage;
  snapshotCoverage: Coverage;
  missingDays: string[];
  lastRunAt?: string;
  pendingPublicationCommit?: string;
  warnings: string[];
}

export async function runCollector(
  options: RunOptions,
  dependencies: CollectorDependencies = {},
): Promise<CollectorRunSummary> {
  if (options.dryRun && options.publish) {
    throw new Error("--dry-run and --publish cannot be used together");
  }
  const config = await loadCollectorConfig();
  const stateResult = await loadCollectorState();
  const warnings = stateResult.warning ? [stateResult.warning] : [];
  const selectedAdapters = await selectAdapters(options.agents ?? config.agents);
  const newFiles: FileCursorMap = {};
  const records = await collectRecords(selectedAdapters, newFiles, warnings);
  const now = dependencies.now?.() ?? new Date();
  const pricing =
    dependencies.pricing ??
    (await loadPricingCatalog(createFilePricingCatalogCache(join(stateDir(), "models-dev-cache.json")), {
      fetcher: dependencies.fetcher,
      now: () => now,
    }));
  const quota = options.dryRun
    ? undefined
    : await collectCopilotQuota({
        token: config.copilotToken,
        warnings,
        fetcher: dependencies.fetcher,
        now,
      });
  const generate = () =>
    options.dryRun
      ? planDailySnapshots({
          repositoryRoot: config.checkoutPath,
          machine: config.machineName,
          records,
          pricing,
          now,
        })
      : generateDailySnapshots({
          repositoryRoot: config.checkoutPath,
          machine: config.machineName,
          records,
          pricing,
          now,
          quotaSamples: quota ? [quota] : [],
        });
  let publication: CollectorRunSummary["publication"];
  const generation = options.publish
    ? await publishSnapshots({
        checkoutPath: config.checkoutPath,
        machine: config.machineName,
        expectedRemoteUrl:
          config.expectedRemoteUrl ??
          (() => {
            throw new Error("expectedRemoteUrl is required in collector config for --publish");
          })(),
        generate,
        onPendingCommitChange: async (pendingPublicationCommit) => {
          await saveCollectorState({
            ...stateResult.state,
            pendingPublicationCommit,
          });
        },
      }).then((result) => {
        publication = {
          recoveredCommit: result.recoveredCommit,
          commit: result.commit,
          published: result.published,
          pushAttempts: result.pushAttempts,
        };
        return result.generation;
      })
    : await generate();
  records.length = 0;

  const preview = summarizeSnapshots(generation.snapshots);
  const summary: CollectorRunSummary = {
    dryRun: options.dryRun,
    generatedAt: now.toISOString(),
    machine: config.machineName,
    sourceCoverage: coverage(generation.availableSourceDates),
    days: preview.days,
    totals: preview.totals,
    writtenDates: generation.writtenDates,
    unchangedDates: generation.unchangedDates,
    protectedClosedDates: generation.protectedClosedDates,
    duplicateRecords: generation.duplicateRecords,
    skippedRecords: generation.skippedRecords,
    warnings,
    publication,
  };

  if (options.out) {
    await mkdir(dirname(options.out), { recursive: true });
    await writeFile(options.out, `${JSON.stringify(summary, null, 2)}\n`, "utf-8");
  }

  if (!options.dryRun) {
    await saveCollectorState({
      schemaVersion: 1,
      files: newFiles,
      lastRunAt: summary.generatedAt,
      pendingPublicationCommit: options.publish ? undefined : stateResult.state.pendingPublicationCommit,
    });
  }

  return summary;
}

export async function statusCollector(): Promise<StatusResult> {
  const config = await loadCollectorConfig();
  const stateResult = await loadCollectorState();
  const warnings = stateResult.warning ? [stateResult.warning] : [];
  const configuredAdapters = config.agents?.length
    ? config.agents.map((name) => createAdapter(name))
    : allAdapters();
  const agents: { name: string; detected: boolean }[] = [];
  const detectedAdapters: Adapter[] = [];

  for (const adapter of configuredAdapters) {
    const detected = await adapter.detect();
    agents.push({ name: adapter.name, detected });
    if (detected) detectedAdapters.push(adapter);
  }

  const sourceRecords = await collectRecords(detectedAdapters, {}, warnings);
  const sourceDates = [...discoverAvailableSourceDates(sourceRecords)];
  sourceRecords.length = 0;
  const snapshotDates = await machineSnapshotDates(config.checkoutPath, config.machineName);
  const pendingPublicationCommit =
    stateResult.state.pendingPublicationCommit ??
    (await detectPendingPublicationCommit(config.checkoutPath, warnings));

  return {
    identity: config.machineName,
    agents,
    sourceCoverage: coverage(sourceDates),
    snapshotCoverage: coverage(snapshotDates),
    missingDays: sourceDates.filter((date) => !snapshotDates.includes(date)),
    lastRunAt: stateResult.state.lastRunAt,
    pendingPublicationCommit,
    warnings,
  };
}

async function selectAdapters(selected?: string[]): Promise<Adapter[]> {
  if (selected && selected.length > 0) return selected.map((name) => createAdapter(name));
  const detected: Adapter[] = [];
  for (const adapter of allAdapters()) {
    if (await adapter.detect()) detected.push(adapter);
  }
  return detected;
}

async function collectRecords(
  adapters: readonly Adapter[],
  files: FileCursorMap,
  warnings: string[],
): Promise<UsageRecord[]> {
  const records: UsageRecord[] = [];
  for (const adapter of adapters) {
    for await (const record of adapter.usage({
      full: true,
      cursors: {},
      onFileComplete(file, cursor) {
        files[file] = cursor;
      },
      onFileSkipped(_file, reason) {
        if (reason !== "unchanged") warnings.push(`${adapter.name}: source skipped (${reason})`);
      },
      onWarning(message) {
        warnings.push(`${adapter.name}: ${message}`);
      },
    })) {
      records.push(record);
    }
  }
  return records;
}

async function machineSnapshotDates(repositoryRoot: string, machine: string): Promise<string[]> {
  const machineRoot = join(repositoryRoot, "snapshots", machine);
  const discovered: { path: string; value: unknown }[] = [];
  await walkMachineSnapshots(machineRoot, `snapshots/${machine}`, discovered);
  return validateSnapshotSet(discovered).map((file) => file.date).sort();
}

async function walkMachineSnapshots(
  absolutePath: string,
  relativePath: string,
  files: { path: string; value: unknown }[],
): Promise<void> {
  const entries = await readdir(absolutePath, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  for (const entry of entries) {
    const absoluteEntry = join(absolutePath, entry.name);
    const relativeEntry = `${relativePath}/${entry.name}`;
    if (entry.isDirectory()) await walkMachineSnapshots(absoluteEntry, relativeEntry, files);
    else if (entry.isFile()) files.push({ path: relativeEntry, value: JSON.parse(await readFile(absoluteEntry, "utf8")) });
  }
}

async function detectPendingPublicationCommit(checkoutPath: string, warnings: string[]): Promise<string | undefined> {
  try {
    const ahead = await execFile("git", ["-C", checkoutPath, "rev-list", "--count", "origin/master..HEAD"]);
    if (Number.parseInt(ahead.stdout.trim(), 10) < 1) return undefined;
    const commit = await execFile("git", ["-C", checkoutPath, "rev-parse", "--short", "HEAD"]);
    return commit.stdout.trim() || undefined;
  } catch {
    warnings.push("pending publication status unavailable");
    return undefined;
  }
}

function coverage(dates: readonly string[]): Coverage {
  const sorted = [...new Set(dates)].sort();
  return { dates: sorted, from: sorted[0], to: sorted.at(-1) };
}
