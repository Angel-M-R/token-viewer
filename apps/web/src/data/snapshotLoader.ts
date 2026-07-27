import {
  SnapshotValidationError,
  type SnapshotSourceFile,
  type ValidatedSnapshotFile,
  validateSnapshotSet,
} from "@tokenviewer/core/snapshots";

export type SnapshotModuleMap = Record<string, unknown>;

const snapshotModules = import.meta.glob("../../../../snapshots/**/*.json", {
  eager: true,
  import: "default",
}) as SnapshotModuleMap;

export function loadDiscoveredSnapshots(): readonly ValidatedSnapshotFile[] {
  return loadSnapshotModules(snapshotModules);
}

export function loadSnapshotModules(modules: SnapshotModuleMap): readonly ValidatedSnapshotFile[] {
  const files: SnapshotSourceFile[] = [];
  const issues: Array<{ code: string; path: string }> = [];

  for (const [modulePath, value] of Object.entries(modules)) {
    const path = canonicalModulePath(modulePath);
    if (!path) {
      issues.push({ code: "snapshot_non_canonical_path", path: modulePath });
      continue;
    }
    files.push({ path, value });
  }

  if (issues.length > 0) throw new SnapshotValidationError(issues);
  return validateSnapshotSet(files);
}

function canonicalModulePath(modulePath: string): string | null {
  const normalized = modulePath.replaceAll("\\", "/");
  const marker = "/snapshots/";
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex >= 0) return normalized.slice(markerIndex + 1);
  return normalized.startsWith("snapshots/") ? normalized : null;
}
