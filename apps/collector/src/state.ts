import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { collectorStatePath, type FileCursorMap } from "@tokenviewer/core";
import { z } from "zod";

export interface CollectorState {
  schemaVersion: 1;
  files: FileCursorMap;
  lastRunAt?: string;
  pendingPublicationCommit?: string;
}

export interface LoadStateResult {
  state: CollectorState;
  warning?: string;
  path: string;
}

const fileCursorSchema = z.object({
  size: z.number().int().nonnegative(),
  mtimeMs: z.number().nonnegative(),
  lastByteOffset: z.number().int().nonnegative().optional(),
});

const collectorStateSchema = z.object({
  schemaVersion: z.literal(1),
  files: z.record(z.string(), fileCursorSchema),
  lastRunAt: z.string().datetime({ offset: true }).optional(),
  pendingPublicationCommit: z.string().min(1).optional(),
});

export async function loadCollectorState(): Promise<LoadStateResult> {
  const path = collectorStatePath();
  const raw = await readFile(path, "utf-8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  });

  if (raw === null) {
    return { state: emptyState(), path };
  }

  try {
    const parsed = collectorStateSchema.parse(JSON.parse(raw));
    return { state: parsed, path };
  } catch {
    return {
      state: emptyState(),
      path,
      warning: `collector state ${path} esta corrupto o usa una version desconocida; se hara un escaneo completo`,
    };
  }
}

export async function saveCollectorState(state: CollectorState): Promise<void> {
  const path = collectorStatePath();
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
  await rename(tempPath, path);
}

export function emptyState(): CollectorState {
  return {
    schemaVersion: 1,
    files: {},
  };
}
