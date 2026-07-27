import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  SnapshotValidationError,
  type SnapshotSourceFile,
  type SnapshotValidationIssue,
  type ValidatedSnapshotFile,
  validateSnapshotSet,
} from "./snapshots.js";

export async function scanSnapshotDirectory(directory: string): Promise<readonly SnapshotSourceFile[]> {
  const discovered: { absolutePath: string; relativePath: string }[] = [];
  const discoveryIssues: SnapshotValidationIssue[] = [];
  await discoverFiles(directory, "", discovered, discoveryIssues);

  const files: SnapshotSourceFile[] = [];
  for (const file of discovered) {
    let source: string;
    try {
      source = await readFile(file.absolutePath, "utf8");
    } catch {
      discoveryIssues.push({ code: "snapshot_unreadable", path: `snapshots/${file.relativePath}` });
      continue;
    }

    try {
      files.push({
        path: `snapshots/${file.relativePath}`,
        value: JSON.parse(source) as unknown,
      });
    } catch {
      discoveryIssues.push({ code: "snapshot_invalid_json", path: `snapshots/${file.relativePath}` });
    }
  }

  if (discoveryIssues.length > 0) {
    throw new SnapshotValidationError(discoveryIssues);
  }
  return files;
}

export async function validateSnapshotDirectory(
  directory: string,
): Promise<readonly ValidatedSnapshotFile[]> {
  return validateSnapshotSet(await scanSnapshotDirectory(directory));
}

async function discoverFiles(
  directory: string,
  relativeDirectory: string,
  files: { absolutePath: string; relativePath: string }[],
  issues: SnapshotValidationIssue[],
): Promise<void> {
  const absoluteDirectory = relativeDirectory ? join(directory, relativeDirectory) : directory;
  let entries;
  try {
    entries = await readdir(absoluteDirectory, { withFileTypes: true });
  } catch (error) {
    if (!relativeDirectory && isMissingPathError(error)) return;
    issues.push({
      code: "snapshot_directory_unreadable",
      path: relativeDirectory ? `snapshots/${toPosixPath(relativeDirectory)}` : "snapshots",
    });
    return;
  }

  entries.sort((left, right) => compareStrings(left.name, right.name));
  for (const entry of entries) {
    const relativePath = relativeDirectory ? join(relativeDirectory, entry.name) : entry.name;
    if (entry.isDirectory()) {
      await discoverFiles(directory, relativePath, files, issues);
      continue;
    }
    if (!entry.isFile()) {
      issues.push({ code: "snapshot_non_regular_entry", path: `snapshots/${toPosixPath(relativePath)}` });
      continue;
    }
    files.push({ absolutePath: join(directory, relativePath), relativePath: toPosixPath(relativePath) });
  }
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function toPosixPath(path: string): string {
  return path.split("\\").join("/");
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
