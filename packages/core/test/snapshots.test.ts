import { describe, expect, it } from "vitest";
import {
  ACTIVE_PUBLISHER_MACHINES,
  activePublisherMachineSchema,
  parseCanonicalSnapshotPath,
  serializeDailySnapshot,
  SNAPSHOT_MACHINES,
  SNAPSHOT_SCHEMA_VERSION,
  snapshotMachineSchema,
  SnapshotValidationError,
  type SnapshotSourceFile,
  validateSnapshotPrivacy,
  validateSnapshotSet,
} from "../src/index.js";
import { angelSnapshot, validSnapshotFiles } from "./fixtures/snapshots.js";

function expectInvalid(files: readonly SnapshotSourceFile[], code: string): void {
  try {
    validateSnapshotSet(files);
    throw new Error("Expected snapshot validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(SnapshotValidationError);
    expect((error as SnapshotValidationError).issues.map((issue) => issue.code)).toContain(code);
  }
}

function angelFile(): SnapshotSourceFile {
  return validSnapshotFiles()[0]!;
}

describe("snapshot contract", () => {
  it("accepts valid snapshots from every closed snapshot identity", () => {
    expect(SNAPSHOT_SCHEMA_VERSION).toBe(2);
    expect(validateSnapshotSet(validSnapshotFiles()).map((file) => file.machine)).toEqual([
      "angel-mac",
      "old-mac",
      "mac-m5",
    ]);
    expect(
      SNAPSHOT_MACHINES.map(
        (machine) =>
          parseCanonicalSnapshotPath(`snapshots/${machine}/2026/07/2026-07-26.json`).machine,
      ),
    ).toEqual(SNAPSHOT_MACHINES);
  });

  it("separates active publisher identities from the historical snapshot identity", () => {
    expect(SNAPSHOT_MACHINES).toEqual(["angel-mac", "old-mac", "mac-m5"]);
    expect(ACTIVE_PUBLISHER_MACHINES).toEqual(["angel-mac", "mac-m5"]);
    expect(SNAPSHOT_MACHINES.every((machine) => snapshotMachineSchema.safeParse(machine).success)).toBe(
      true,
    );
    expect(
      ACTIVE_PUBLISHER_MACHINES.every(
        (machine) => activePublisherMachineSchema.safeParse(machine).success,
      ),
    ).toBe(true);
    expect(activePublisherMachineSchema.safeParse("old-mac").success).toBe(false);
  });

  it("rejects non-canonical and impossible paths", () => {
    expectInvalid([{ ...angelFile(), path: "snapshots/angel-mac/2026/7/2026-07-26.json" }], "non_canonical_path");
    expectInvalid([{ ...angelFile(), path: "snapshots/angel-mac/2026/02/2026-02-30.json" }], "non_canonical_path");
  });

  it("rejects duplicate canonical paths", () => {
    const file = angelFile();
    expectInvalid([file, structuredClone(file)], "duplicate_path");
  });

  it("rejects machine and date disagreement with the path", () => {
    const wrongMachine = angelFile();
    (wrongMachine.value as { machine: string }).machine = "old-mac";
    expectInvalid([wrongMachine], "machine_path_disagreement");

    const wrongDate = angelFile();
    (wrongDate.value as { date: string }).date = "2026-07-25";
    expectInvalid([wrongDate], "date_path_disagreement");
  });

  it("rejects quota samples outside the snapshot date and quota instants with a time component", () => {
    const quotaOutside = angelFile();
    (quotaOutside.value as typeof angelSnapshot).quotaSamples[0]!.takenAt = "2026-07-25";
    expectInvalid([quotaOutside], "quota_outside_snapshot_date");

    const quotaWithTime = angelFile();
    (quotaWithTime.value as typeof angelSnapshot).quotaSamples[0]!.takenAt =
      "2026-07-26T08:30:00.000Z";
    expectInvalid([quotaWithTime], "schema_invalid_format");
  });

  it("rejects duplicate aggregate keys", () => {
    const file = angelFile();
    const snapshot = file.value as typeof angelSnapshot;
    snapshot.usage[1] = structuredClone(snapshot.usage[0]!);
    expectInvalid([file], "duplicate_aggregate_key");
  });

  it("rejects non-canonical usage and quota ordering", () => {
    const usageOrder = angelFile();
    (usageOrder.value as typeof angelSnapshot).usage.reverse();
    expectInvalid([usageOrder], "non_canonical_usage_order");

    const quotaOrder = angelFile();
    (quotaOrder.value as typeof angelSnapshot).quotaSamples.reverse();
    expectInvalid([quotaOrder], "non_canonical_quota_order");
  });

  it("rejects non-finite and negative aggregate values", () => {
    const infinite = angelFile();
    (infinite.value as typeof angelSnapshot).usage[0]!.estimatedCost = Number.POSITIVE_INFINITY;
    expectInvalid([infinite], "schema_invalid_type");

    const negative = angelFile();
    (negative.value as typeof angelSnapshot).usage[0]!.requests = -1;
    expectInvalid([negative], "schema_too_small");
  });

  it("rejects inconsistent derived totals", () => {
    const file = angelFile();
    (file.value as typeof angelSnapshot).totals!.requests += 1;
    expectInvalid([file], "derived_total_mismatch");
  });

  it("serializes deterministically regardless of input property insertion order", () => {
    const reordered = Object.fromEntries(Object.entries(angelSnapshot).reverse()) as typeof angelSnapshot;
    reordered.usage = angelSnapshot.usage.map(
      (row) => Object.fromEntries(Object.entries(row).reverse()) as typeof row,
    );
    reordered.quotaSamples = angelSnapshot.quotaSamples.map(
      (sample) => Object.fromEntries(Object.entries(sample).reverse()) as typeof sample,
    );
    reordered.totals = Object.fromEntries(
      Object.entries(angelSnapshot.totals!).reverse(),
    ) as typeof angelSnapshot.totals;
    expect(serializeDailySnapshot(reordered as typeof angelSnapshot)).toBe(
      serializeDailySnapshot(angelSnapshot),
    );
  });
});

describe("snapshot privacy", () => {
  it("rejects unknown closed-schema properties", () => {
    const file = angelFile();
    (file.value as Record<string, unknown>)["unexpected"] = true;
    expectInvalid([file], "privacy_unknown_property");
  });

  it.each([
    "promptText",
    "conversation_id",
    "messages",
    "sessionName",
    "projectId",
    "file_path",
    "credentials",
    "auth_token",
    "login",
    "originalPayload",
    "raw_response",
    "sourceFilePath",
    "record_hash",
  ])(
    "rejects the forbidden field %s without exposing its value",
    (field) => {
      const value = { ...structuredClone(angelSnapshot), [field]: "PRIVATE-VALUE" };
      expect(() => validateSnapshotPrivacy(value, "snapshot.json")).toThrowError(
        SnapshotValidationError,
      );
      try {
        validateSnapshotPrivacy(value, "snapshot.json");
      } catch (error) {
        expect((error as Error).message).not.toContain("PRIVATE-VALUE");
      }
    },
  );
});
