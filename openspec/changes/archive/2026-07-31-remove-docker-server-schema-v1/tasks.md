## 1. Remove Active Infrastructure

- [x] 1.1 Remove the versioned `.dockerignore`, `docker/**`, and `apps/server/**` trees, including server tests, migrations, static hosting, authentication, routes, and package configuration, without running Docker or deleting any local image, database, build, cache, or ignored artifact.
- [x] 1.2 Remove server, Docker, TokenViewer-owned SQLite, HTTP-ingestion, and retired migration references from root scripts, workspace configuration, package manifests, TypeScript configuration, and `pnpm-lock.yaml`, while retaining `better-sqlite3` only for read-only third-party adapters.
- [x] 1.3 Remove the active one-time snapshot conversion/equivalence implementation and its dedicated tests, fixtures, scripts, and configuration under `scripts/migration/**`; do not modify `openspec/changes/archive/**`, Git history, retained historical records, or operational rollback artifacts.

## 2. Keep Only the Snapshot v2 Contract

- [x] 2.1 Simplify active snapshot validation to use the closed v2 schema directly, removing specialized legacy-version detection, conversion, or compatibility paths while retaining `SNAPSHOT_SCHEMA_VERSION = 2`, privacy validation, invariants, and deterministic serialization.
- [x] 2.2 Remove snapshot-version-1 fixtures and negative test cases from the active core test suite; keep positive v2 fixtures and ordinary schema/privacy failure coverage without introducing replacement v1 fixtures or tests.
- [x] 2.3 Run the existing focused core snapshot tests and snapshot validation command after the simplification, and correct only failures caused by the cleanup.

## 3. Reconcile Configuration and Documentation

- [x] 3.1 Remove the pending `post-retirement` test, root script, TypeScript include, and workflow step so the change does not add or retain a new CI guard; preserve the repository's other existing validation steps.
- [x] 3.2 Update active architecture, collector, dashboard, quota, and operational documentation only where needed to describe the collector-plus-local-dashboard v2 system, without editing archived OpenSpec or migration records.
- [x] 3.3 Inspect active versioned manifests, configs, source, tests, and docs for stale imports, scripts, dependencies, or executable references to Docker, `apps/server`, internal HTTP routes, owned SQLite, or snapshot-v1 tooling, and remove only references that belong to the retired implementation.

## 4. Preserve Dashboard Behavior

- [x] 4.1 Keep the existing local snapshot loader, query repository, hooks, components, filters, styles, and visible copy unchanged except for compile-required removal of retired dependencies.
- [x] 4.2 Run the existing focused web tests, including the local dashboard integration smoke, and correct only cleanup regressions; do not add views, controls, compatibility behavior, or adjacent refactors.

## 5. Remove Internal Collector-State Versioning

- [x] 5.1 Remove `schemaVersion` from the `CollectorState` type, empty state, all save call sites, and serialized `collector-state.json`; make the state validator strict while preserving the existing allowed cursor, timestamp, and pending-publication fields and the existing invalid/unknown-state warning path. Do not add a v2 state version, compatibility, conversion, file deletion, or migration tooling.
- [x] 5.2 Update the bounded collector state and end-to-end tests to prove valid unversioned state round-trips without unknown fields, state containing the former version-1 field is rejected through the ordinary warning and empty-state path, and the resulting run performs a complete rescan without converting or deleting the local input. Keep snapshot-v1 fixtures and compatibility tests removed.
- [x] 5.3 Run the focused collector state and end-to-end tests plus the collector typecheck, and correct only failures attributable to tasks 5.1-5.2.

## 6. Final Verification
<!-- owner: openspec-verifier -->

- [ ] 6.1 Before any other verifier-owned command, record the current `git status --short --untracked-files=all` and create an external temporary baseline containing the path set and content hashes of every existing ignored file reported by `git ls-files --others --ignored --exclude-standard`; this baseline records only the state immediately before assigned verification commands and MUST NOT be represented as a clean pre-change Git baseline.
- [ ] 6.2 Execute the existing complete snapshot validation and record the command, exit code 0, validated file count, and confirmation that every active snapshot uses schema v2.
- [ ] 6.3 Execute the existing full test suite, full typecheck, and full build as separate commands and report each command and exit code; all MUST exit 0.
- [ ] 6.4 Execute the existing dashboard integration smoke and report exit code 0 with evidence that the v2 dashboard loads all current views and identities without visible behavior changes or internal TokenViewer network calls.
- [ ] 6.5 Inspect the final versioned implementation, configuration, tests, fixtures, scripts, and active documentation and report exit-code-0 evidence that no active Docker tree, `apps/server` tree, TokenViewer-owned SQLite/server surface, snapshot-v1 compatibility or conversion tool, or snapshot-v1 fixture/test remains outside historical records. The same inspection MUST prove that no active accepted or produced `schemaVersion: 1`/schema-v1 collector-state contract remains; the bounded rejection test and planning text may mention the retired field only as invalid input and MUST NOT provide compatibility.
- [ ] 6.6 Report final Git status and changed files with the archive relocation treated explicitly as pre-existing in this uncommitted working tree, not as a clean baseline inferred by Git. Compare every file from `HEAD:openspec/changes/migrate-to-git-snapshots/**` with its mapped path under `openspec/changes/archive/2026-07-31-migrate-to-git-snapshots/**`, require identical path sets and byte-equivalent contents, and record exit-code-0 evidence that this change did not edit archived contents beyond the authorized relocation. Recompute the ignored-file path/hash inventory from task 6.1 after all assigned commands and require an exact match, confirming those local artifacts remain ignored and were not modified by the verifier commands; do not clean, restore, stage, or otherwise alter them to obtain acceptance.
