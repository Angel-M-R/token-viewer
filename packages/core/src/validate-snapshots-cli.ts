import { resolve } from "node:path";
import { SNAPSHOT_SCHEMA_VERSION, SnapshotValidationError } from "./snapshots.js";
import { validateSnapshotDirectory } from "./snapshot-files.js";

const snapshotsDirectory = resolve(process.cwd(), process.argv[2] ?? "snapshots");

try {
  const files = await validateSnapshotDirectory(snapshotsDirectory);
  console.log(`Validated ${files.length} schema v${SNAPSHOT_SCHEMA_VERSION} snapshot file(s).`);
} catch (error) {
  if (error instanceof SnapshotValidationError) {
    console.error(error.message);
  } else {
    console.error("Snapshot validation failed unexpectedly.");
  }
  process.exitCode = 1;
}
