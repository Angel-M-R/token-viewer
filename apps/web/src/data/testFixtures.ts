import { LocalSnapshotRepository } from "./repository";
import { loadSnapshotModules, type SnapshotModuleMap } from "./snapshotLoader";

export const representativeSnapshotModules = import.meta.glob(
  "./fixtures/snapshots/*/*/*/*.json",
  { eager: true, import: "default" },
) as SnapshotModuleMap;

export function representativeRepository(): LocalSnapshotRepository {
  return new LocalSnapshotRepository(loadSnapshotModules(representativeSnapshotModules));
}
