import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const binDir = join(packageRoot, "node_modules", ".bin");
const binPath = join(binDir, "tokenviewer-collector");
const shim = `#!/usr/bin/env node\nimport("../../dist/cli.js");\n`;

mkdirSync(binDir, { recursive: true });
writeFileSync(binPath, shim, "utf-8");
chmodSync(binPath, 0o755);
