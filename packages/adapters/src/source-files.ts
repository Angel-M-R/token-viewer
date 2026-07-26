import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { FileCursor, UsageOptions } from "@tokenviewer/core";

export interface JsonLine {
  line: string;
  lineNumber: number;
}

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function* walkFiles(
  root: string,
  predicate: (fileName: string) => boolean,
): AsyncGenerator<string> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return;
  }

  for (const entry of entries) {
    const path = join(root, entry);
    const entryStat = await stat(path).catch(() => null);
    if (!entryStat) {
      continue;
    }

    if (entryStat.isDirectory()) {
      yield* walkFiles(path, predicate);
    } else if (predicate(entry)) {
      yield path;
    }
  }
}

export async function shouldUseSqliteSource(
  filePath: string,
  options?: UsageOptions,
): Promise<boolean> {
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat) {
    options?.onFileSkipped?.(filePath, "missing");
    return false;
  }

  const cursor = options?.cursors?.[filePath];
  if (
    !options?.full &&
    cursor &&
    cursor.size === fileStat.size &&
    cursor.mtimeMs === fileStat.mtimeMs
  ) {
    options?.onFileSkipped?.(filePath, "unchanged");
    return false;
  }

  return true;
}

export async function completeSqliteSource(
  filePath: string,
  options?: UsageOptions,
): Promise<void> {
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat) {
    return;
  }

  options?.onFileComplete?.(filePath, {
    size: fileStat.size,
    mtimeMs: fileStat.mtimeMs,
    lastByteOffset: 0,
  });
}

export async function readJsonFileWithCursor(
  filePath: string,
  options?: UsageOptions,
): Promise<unknown | undefined> {
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat) {
    options?.onFileSkipped?.(filePath, "missing");
    return undefined;
  }

  const cursor = options?.cursors?.[filePath];
  if (
    !options?.full &&
    cursor &&
    cursor.size === fileStat.size &&
    cursor.mtimeMs === fileStat.mtimeMs
  ) {
    options?.onFileSkipped?.(filePath, "unchanged");
    return undefined;
  }

  try {
    const parsed = JSON.parse(await readFile(filePath, "utf-8")) as unknown;
    options?.onFileComplete?.(filePath, {
      size: fileStat.size,
      mtimeMs: fileStat.mtimeMs,
      lastByteOffset: fileStat.size,
    });
    return parsed;
  } catch {
    options?.onFileSkipped?.(filePath, "malformed");
    return undefined;
  }
}

export async function readCompleteJsonlLines(
  filePath: string,
  options?: UsageOptions,
): Promise<JsonLine[]> {
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat) {
    options?.onFileSkipped?.(filePath, "missing");
    return [];
  }

  const cursor = options?.cursors?.[filePath];
  if (
    !options?.full &&
    cursor &&
    cursor.size === fileStat.size &&
    cursor.mtimeMs === fileStat.mtimeMs
  ) {
    options?.onFileSkipped?.(filePath, "unchanged");
    return [];
  }

  const startOffset = !options?.full && cursor && fileStat.size >= cursor.size
    ? cursor.lastByteOffset ?? 0
    : 0;
  const raw = await readFile(filePath).catch(() => null);
  if (!raw) {
    options?.onFileSkipped?.(filePath, "unreadable");
    return [];
  }

  const chunk = raw.subarray(Math.min(startOffset, raw.length));
  const lastNewline = chunk.lastIndexOf(0x0a);
  const complete = lastNewline >= 0 ? chunk.subarray(0, lastNewline + 1) : Buffer.alloc(0);
  const lastByteOffset = startOffset + complete.byteLength;

  const lineBase = startOffset > 0 ? countCompleteLines(raw.subarray(0, startOffset)) : 0;
  const lines = complete
    .toString("utf-8")
    .split(/\n/)
    .slice(0, -1)
    .map((line, index) => ({ line: line.replace(/\r$/, ""), lineNumber: lineBase + index + 1 }))
    .filter(({ line }) => line.trim().length > 0);

  const cursorUpdate: FileCursor = {
    size: fileStat.size,
    mtimeMs: fileStat.mtimeMs,
    lastByteOffset,
  };
  options?.onFileComplete?.(filePath, cursorUpdate);

  return lines;
}

export function fileExistsSync(path: string): boolean {
  return existsSync(path);
}

function countCompleteLines(buffer: Buffer): number {
  let count = 0;
  for (const byte of buffer) {
    if (byte === 0x0a) {
      count += 1;
    }
  }
  return count;
}
