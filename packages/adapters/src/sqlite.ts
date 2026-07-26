import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileExistsSync } from "./source-files.js";

export interface SqliteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown | undefined;
}

export interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  close(): void;
}

interface NodeSqliteModule {
  DatabaseSync: new (
    filename: string,
    options?: { open?: boolean; readOnly?: boolean; timeout?: number },
  ) => SqliteDatabase;
}

/** Opens a read-only SQLite database, returning null when no local driver works. */
export async function openReadonlySqliteDatabase(dbPath: string): Promise<SqliteDatabase | null> {
  const requestedDriver = process.env["TOKENVIEWER_SQLITE_DRIVER"];
  const loaders = requestedDriver
    ? [driverLoader(requestedDriver)].filter((loader): loader is DriverLoader => Boolean(loader))
    : [openWithNodeSqlite, openWithBetterSqlite3];

  for (const loader of loaders) {
    try {
      return await loader(dbPath);
    } catch {
      continue;
    }
  }

  return openCopiedDatabase(dbPath, loaders);
}

type DriverLoader = (dbPath: string) => Promise<SqliteDatabase>;

function driverLoader(driver: string): DriverLoader | null {
  switch (driver) {
    case "node":
    case "node:sqlite":
      return openWithNodeSqlite;
    case "better-sqlite3":
      return openWithBetterSqlite3;
    default:
      return null;
  }
}

async function openWithNodeSqlite(dbPath: string): Promise<SqliteDatabase> {
  const sqlite = await importNodeSqlite();
  return new sqlite.DatabaseSync(dbPath, { open: true, readOnly: true, timeout: 5000 });
}

async function openWithBetterSqlite3(dbPath: string): Promise<SqliteDatabase> {
  const BetterSqlite3 = await import("better-sqlite3");
  const Ctor = BetterSqlite3.default ?? BetterSqlite3;
  return new (Ctor as unknown as new (...args: unknown[]) => SqliteDatabase)(dbPath, {
    readonly: true,
    fileMustExist: true,
  });
}

async function importNodeSqlite(): Promise<NodeSqliteModule> {
  const originalEmitWarning = process.emitWarning;
  process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
    const message = typeof warning === "string" ? warning : warning.message;
    const type = typeof args[0] === "string" ? args[0] : undefined;
    if (
      message === "SQLite is an experimental feature and might change at any time" &&
      type === "ExperimentalWarning"
    ) {
      return;
    }

    (originalEmitWarning as (...emitArgs: unknown[]) => void)(warning, ...args);
  }) as typeof process.emitWarning;

  try {
    const sqlite = (await import("node:sqlite")) as NodeSqliteModule;
    if (typeof sqlite.DatabaseSync !== "function") {
      throw new Error("node:sqlite DatabaseSync is unavailable");
    }
    return sqlite;
  } finally {
    process.emitWarning = originalEmitWarning;
  }
}

async function openCopiedDatabase(
  dbPath: string,
  loaders: DriverLoader[],
): Promise<SqliteDatabase | null> {
  const tempDir = await mkdtemp(join(tmpdir(), "tokenviewer-sqlite-")).catch(() => null);
  if (!tempDir) {
    return null;
  }

  const tempDbPath = join(tempDir, basename(dbPath));
  try {
    await copyFile(dbPath, tempDbPath);
    for (const suffix of ["-wal", "-shm"]) {
      if (fileExistsSync(`${dbPath}${suffix}`)) {
        await copyFile(`${dbPath}${suffix}`, `${tempDbPath}${suffix}`).catch(() => undefined);
      }
    }

    for (const loader of loaders) {
      try {
        const db = await loader(tempDbPath);
        return wrapDatabaseWithCleanup(db, tempDir);
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }

  await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  return null;
}

function wrapDatabaseWithCleanup(db: SqliteDatabase, tempDir: string): SqliteDatabase {
  return {
    prepare(sql: string) {
      return db.prepare(sql);
    },
    close() {
      try {
        db.close();
      } finally {
        void rm(tempDir, { recursive: true, force: true });
      }
    },
  };
}
