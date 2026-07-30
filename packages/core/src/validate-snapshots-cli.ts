import { resolve } from "node:path";
import { SNAPSHOT_SCHEMA_VERSION, SnapshotValidationError } from "./snapshots.js";
import { scanSnapshotDirectory, validateSnapshotDirectory } from "./snapshot-files.js";

const snapshotsDirectory = resolve(process.cwd(), process.argv[2] ?? "snapshots");

try {
  const legacy = (await scanSnapshotDirectory(snapshotsDirectory)).filter(
    (file) => schemaVersionOf(file.value) !== SNAPSHOT_SCHEMA_VERSION,
  );
  if (legacy.length > 0) {
    console.error(
      `${legacy.length} snapshot file(s) do not declare schemaVersion ${SNAPSHOT_SCHEMA_VERSION}:`,
    );
    for (const file of legacy) {
      console.error(`${file.path}: unsupported_schema_version`);
    }
    process.exitCode = 1;
  } else {
    const files = await validateSnapshotDirectory(snapshotsDirectory);
    console.log(`Validated ${files.length} schema v${SNAPSHOT_SCHEMA_VERSION} snapshot file(s).`);
  }
} catch (error) {
  if (error instanceof SnapshotValidationError) {
    console.error(error.message);
  } else {
    console.error("Snapshot validation failed unexpectedly.");
  }
  process.exitCode = 1;
}

function schemaVersionOf(value: unknown): unknown {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)["schemaVersion"]
    : undefined;
}
