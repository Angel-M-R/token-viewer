import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { validateSnapshotDirectory } from "../src/index.js";
import { angelSnapshot, aonM5Snapshot, aonSnapshot } from "./fixtures/snapshots.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createSnapshotRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tokenviewer-snapshots-"));
  temporaryDirectories.push(root);
  return root;
}

async function writeSnapshot(root: string, relativePath: string, value: unknown): Promise<void> {
  const filePath = join(root, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value), "utf8");
}

describe("snapshot directory validation", () => {
  it("scans and validates every canonical snapshot recursively", async () => {
    const root = await createSnapshotRoot();
    await writeSnapshot(root, "angel-mac/2026/07/2026-07-26.json", angelSnapshot);
    await writeSnapshot(root, "aon-mac/2026/07/2026-07-26.json", aonSnapshot);
    await writeSnapshot(root, "aon-mac-m5/2026/07/2026-07-26.json", aonM5Snapshot);

    await expect(validateSnapshotDirectory(root)).resolves.toHaveLength(3);
  });

  it("makes the CLI exit non-zero on privacy failures without printing values", async () => {
    const root = await createSnapshotRoot();
    await writeSnapshot(root, "angel-mac/2026/07/2026-07-26.json", {
      ...angelSnapshot,
      raw: "PRIVATE-VALUE",
    });

    const cliPath = fileURLToPath(new URL("../src/validate-snapshots-cli.ts", import.meta.url));
    const result = spawnSync("pnpm", ["exec", "tsx", cliPath, root], {
      cwd: fileURLToPath(new URL("../../..", import.meta.url)),
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("privacy_forbidden_property");
    expect(result.stderr).not.toContain("PRIVATE-VALUE");
  });
});
