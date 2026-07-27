import { execFile as execFileCallback } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { validateSnapshotDirectory } from "../../packages/core/src/snapshot-files.js";

const execFile = promisify(execFileCallback);
const EMPTY_GIT_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const CANONICAL_SNAPSHOT_PATH =
  /^snapshots\/(angel-mac|aon-mac|aon-mac-m5)\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}\.json$/;

export const DEFAULT_MAX_SNAPSHOT_BYTES = 50 * 1024 * 1024;
export const DEFAULT_MAX_VALIDATION_MS = 10_000;

export interface SnapshotBudget {
  files: number;
  bytes: number;
  validationMs: number;
}

export interface SnapshotBudgetLimits {
  maxBytes: number;
  maxValidationMs: number;
}

export class SnapshotPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotPolicyError";
  }
}

export function normalizeCliArguments(args: readonly string[]): readonly string[] {
  return args[0] === "--" ? args.slice(1) : args;
}

export function assertSingleMachineSnapshotPublication(paths: readonly string[]): void {
  const normalizedPaths = paths.map((path) => path.replaceAll("\\", "/").replace(/^\.\//, ""));
  const snapshotPaths = normalizedPaths.filter((path) => path.startsWith("snapshots/"));
  const machines = new Set<string>();

  for (const path of snapshotPaths) {
    const match = CANONICAL_SNAPSHOT_PATH.exec(path);
    if (!match?.[1]) {
      throw new SnapshotPolicyError(`Data publication contains a non-canonical snapshot path: ${path}`);
    }
    machines.add(match[1]);
  }

  const isDataOnlySnapshotPublication =
    snapshotPaths.length > 0 && snapshotPaths.length === normalizedPaths.length;
  if (!isDataOnlySnapshotPublication) return;

  if (machines.has("aon-mac")) {
    throw new SnapshotPolicyError("Data publication cannot publish from retired machine folder: aon-mac");
  }

  if (machines.size > 1) {
    throw new SnapshotPolicyError(
      `Data publication mixes machine folders: ${[...machines].sort().join(", ")}`,
    );
  }
}

export async function changedPaths(
  repositoryRoot: string,
  baseRevision: string,
  headRevision: string,
): Promise<readonly string[]> {
  const base = await normalizeBaseRevision(repositoryRoot, baseRevision, headRevision);
  const output = await git(repositoryRoot, [
    "diff",
    "--name-only",
    "-z",
    "--diff-filter=ACDMRTUXB",
    base,
    headRevision,
  ]);
  return output.split("\0").filter(Boolean);
}

export async function inspectSnapshotDirectories(
  repositoryRoot: string,
  relativeDirectories: readonly string[],
  limits: SnapshotBudgetLimits,
): Promise<SnapshotBudget> {
  const startedAt = performance.now();
  let files = 0;
  let bytes = 0;

  for (const relativeDirectory of relativeDirectories) {
    const directory = resolve(repositoryRoot, relativeDirectory);
    const validated = await validateSnapshotDirectory(directory);
    files += validated.length;
    bytes += await directorySize(directory);
  }

  const validationMs = performance.now() - startedAt;
  if (bytes > limits.maxBytes) {
    throw new SnapshotPolicyError(
      `Snapshot footprint ${bytes} bytes exceeds the ${limits.maxBytes} byte CI budget`,
    );
  }
  if (validationMs > limits.maxValidationMs) {
    throw new SnapshotPolicyError(
      `Snapshot validation took ${validationMs.toFixed(1)} ms, exceeding the ${limits.maxValidationMs} ms CI budget`,
    );
  }

  return { files, bytes, validationMs };
}

async function normalizeBaseRevision(
  repositoryRoot: string,
  baseRevision: string,
  headRevision: string,
): Promise<string> {
  if (baseRevision && !/^0+$/.test(baseRevision)) return baseRevision;
  try {
    return await git(repositoryRoot, ["rev-parse", `${headRevision}^`]);
  } catch {
    return EMPTY_GIT_TREE;
  }
}

async function directorySize(directory: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingPathError(error)) return 0;
    throw error;
  }

  let bytes = 0;
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      bytes += await directorySize(path);
    } else if (entry.isFile()) {
      bytes += (await stat(path)).size;
    } else {
      throw new SnapshotPolicyError(`Snapshot budget cannot inspect non-regular entry: ${path}`);
    }
  }
  return bytes;
}

async function git(repositoryRoot: string, args: readonly string[]): Promise<string> {
  try {
    const result = await execFile("git", ["-C", repositoryRoot, ...args], {
      encoding: "utf8",
      env: { ...process.env, LC_ALL: "C", GIT_TERMINAL_PROMPT: "0" },
      maxBuffer: 10 * 1024 * 1024,
    });
    return result.stdout.trim();
  } catch {
    throw new SnapshotPolicyError(`git ${args[0] ?? "command"} failed`);
  }
}

function positiveLimit(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new SnapshotPolicyError(`${name} must be a positive number`);
  }
  return parsed;
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function main(args: readonly string[]): Promise<void> {
  const [command, ...commandArgs] = args;
  if (command === "publication") {
    const [baseRevision = "", headRevision = "HEAD"] = normalizeCliArguments(commandArgs);
    const paths = await changedPaths(process.cwd(), baseRevision, headRevision);
    assertSingleMachineSnapshotPublication(paths);
    console.log(`Snapshot publication policy passed for ${paths.length} changed file(s).`);
    return;
  }

  if (command === "budget") {
    const directories = commandArgs.length > 0 ? commandArgs : ["snapshots"];
    const budget = await inspectSnapshotDirectories(process.cwd(), directories, {
      maxBytes: positiveLimit(
        process.env.TOKENVIEWER_SNAPSHOT_MAX_BYTES,
        DEFAULT_MAX_SNAPSHOT_BYTES,
        "TOKENVIEWER_SNAPSHOT_MAX_BYTES",
      ),
      maxValidationMs: positiveLimit(
        process.env.TOKENVIEWER_SNAPSHOT_MAX_VALIDATION_MS,
        DEFAULT_MAX_VALIDATION_MS,
        "TOKENVIEWER_SNAPSHOT_MAX_VALIDATION_MS",
      ),
    });
    console.log(
      `Snapshot budget passed: ${budget.files} file(s), ${budget.bytes} bytes, ${budget.validationMs.toFixed(1)} ms.`,
    );
    return;
  }

  throw new SnapshotPolicyError("Usage: snapshot-policy <publication|budget> [arguments]");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Snapshot CI policy failed unexpectedly.");
    process.exitCode = 1;
  });
}
