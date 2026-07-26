import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(packageRoot, "src", "db", "migrations");
const target = join(packageRoot, "dist", "db", "migrations");

mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
