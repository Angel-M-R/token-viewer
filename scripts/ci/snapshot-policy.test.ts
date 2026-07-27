import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  assertSingleMachineSnapshotPublication,
  inspectSnapshotDirectories,
  normalizeCliArguments,
} from "./snapshot-policy.js";

const execFile = promisify(execFileCallback);
const repositoryRoot = resolve(import.meta.dirname, "../..");

describe("snapshot CI policy", () => {
  it("permits a migration that changes application artifacts and snapshots from multiple machines", () => {
    expect(() =>
      assertSingleMachineSnapshotPublication([
        "packages/core/src/snapshots.ts",
        "openspec/changes/migrate-to-git-snapshots/design.md",
        "snapshots/angel-mac/2026/07/2026-07-26.json",
        "snapshots/aon-mac/2026/07/2026-07-26.json",
        "snapshots/aon-mac-m5/2026/07/2026-07-26.json",
      ]),
    ).not.toThrow();
  });

  it("rejects a data-only publication that mixes active machine folders", () => {
    expect(() =>
      assertSingleMachineSnapshotPublication([
        "snapshots/angel-mac/2026/07/2026-07-26.json",
        "snapshots/aon-mac-m5/2026/07/2026-07-26.json",
      ]),
    ).toThrow(/mixes machine folders/);
  });

  it("rejects retired and non-canonical snapshot paths", () => {
    expect(() =>
      assertSingleMachineSnapshotPublication([
        "snapshots/aon-mac/2026/07/2026-07-26.json",
      ]),
    ).toThrow(/retired machine folder/);

    expect(() =>
      assertSingleMachineSnapshotPublication([
        "packages/core/src/snapshots.ts",
        "snapshots/angel-mac/2026/07/../../package.json",
      ]),
    ).toThrow(/non-canonical snapshot path/);
  });

  it("accepts a data-only publication owned by one active machine", () => {
    expect(() =>
      assertSingleMachineSnapshotPublication([
        "snapshots/aon-mac-m5/2026/07/2026-07-25.json",
        "snapshots/aon-mac-m5/2026/07/2026-07-26.json",
      ]),
    ).not.toThrow();

    expect(normalizeCliArguments(["--", "BASE", "HEAD"])).toEqual(["BASE", "HEAD"]);
  });

  it("validates representative three-machine fixtures within a bounded budget", async () => {
    const maxBytes = 16 * 1024;
    const maxValidationMs = 5_000;
    const budget = await inspectSnapshotDirectories(
      repositoryRoot,
      ["scripts/fixtures/snapshots"],
      { maxBytes, maxValidationMs },
    );

    expect(budget.files).toBe(3);
    expect(budget.bytes).toBeGreaterThan(0);
    expect(budget.bytes).toBeLessThanOrEqual(maxBytes);
    expect(budget.validationMs).toBeLessThanOrEqual(maxValidationMs);
  });

  it("keeps the CI workflow read-only for snapshots and Git history", async () => {
    const workflow = await readFile(
      resolve(repositoryRoot, ".github/workflows/snapshot-validation.yml"),
      "utf8",
    );

    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toContain("chmod -R a-w snapshots");
    expect(workflow).toContain("git diff --exit-code -- snapshots");
    expect(workflow).toContain("git status --porcelain=v1 --untracked-files=all -- snapshots");
    expect(workflow).not.toMatch(/\bgit\s+(?:add|commit|push)\b/);

    const result = await execFile("git", ["-C", repositoryRoot, "diff", "--name-only", "HEAD", "HEAD"]);
    expect(result.stdout).toBe("");
  });
});
