import { SnapshotValidationError } from "@tokenviewer/core/snapshots";
import { describe, expect, it } from "vitest";
import { loadSnapshotModules } from "./snapshotLoader";
import { representativeSnapshotModules } from "./testFixtures";

describe("snapshot loader", () => {
  it("loads every statically discovered daily snapshot without a manifest", () => {
    const snapshots = loadSnapshotModules(representativeSnapshotModules);

    expect(snapshots.map((file) => `${file.machine}:${file.date}`)).toEqual([
      "angel-mac:2026-07-04",
      "angel-mac:2026-07-05",
      "aon-mac-m5:2026-07-05",
      "aon-mac:2026-07-04",
    ]);
  });

  it("rejects the whole discovered set when one snapshot is invalid", () => {
    const [path, valid] = Object.entries(representativeSnapshotModules)[0] ?? [];
    expect(path).toBeTruthy();
    const invalid = { ...(valid as Record<string, unknown>), login: "must-not-load" };

    expect(() => loadSnapshotModules({ [path as string]: invalid })).toThrow(SnapshotValidationError);
  });
});
