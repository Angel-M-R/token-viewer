import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface DbClient {
  sqlite: DatabaseSync;
  close(): void;
}

export function openDb(dbPath: string): DbClient {
  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec("PRAGMA journal_mode=WAL");
  sqlite.exec("PRAGMA foreign_keys=ON");
  sqlite.exec("PRAGMA busy_timeout=5000");
  applyMigrations(sqlite);

  return {
    sqlite,
    close() {
      sqlite.close();
    },
  };
}

export function openMemoryDb(): DbClient {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  sqlite.exec("PRAGMA busy_timeout=5000");
  applyMigrations(sqlite);
  return {
    sqlite,
    close() {
      sqlite.close();
    },
  };
}

function applyMigrations(sqlite: DatabaseSync): void {
  const migration = readFileSync(join(import.meta.dirname, "migrations", "0000_initial.sql"), "utf-8");
  sqlite.exec(migration);
}
