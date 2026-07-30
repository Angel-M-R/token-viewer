## 1. Snapshot Contract and Validation

- [x] 1.1 Split the closed machine registry in `packages/core` into snapshot identities for `angel-mac`, the retired legacy Mac and the new M5 Mac, and active publisher identities for `angel-mac` and the new M5 Mac, while retaining the daily snapshot, hourly usage, sanitized quota, and canonical unknown-dimension types.
- [x] 1.2 Update canonical path parsing and whole-set validation to accept all three snapshot identities, including the retired legacy Mac, while preserving machine/date agreement, UTC membership, duplicate aggregate keys, ordering, finite non-negative values, and derived totals.
- [x] 1.3 Implement privacy validation that rejects unknown properties and forbidden raw or identifying fields without logging their values.
- [x] 1.4 Update core fixtures and focused unit tests for valid snapshots from all three identities, active-versus-historical lifecycle checks, each invariant failure, forbidden fields, and deterministic serialization; these checks MUST NOT require a build or full repository suite.
- [x] 1.5 Add a repository-level validation command that scans all of `snapshots/` and returns a non-zero exit code on any contract or privacy failure.

## 2. Local Pricing and Hourly Aggregation

- [x] 2.1 Extract or relocate the models.dev catalog, local cache, fallback, alias, provider inference, and context-tier pricing logic from the server into a reusable local module without SQLite persistence.
- [x] 2.2 Add tests proving fresh, stale, fallback, unknown-model, billed-cost, and long-context pricing behavior before aggregation.
- [x] 2.3 Implement in-memory deduplication by `recordHash` and per-record cost calculation followed by aggregation on UTC hour, machine, agent, provider, and model.
- [x] 2.4 Add aggregation tests for all five token categories, requests, estimated cost, billed cost, unpriced requests, unknown dimensions, and omission of private record fields.
- [x] 2.5 Implement deterministic daily serialization and atomic writes limited to `snapshots/<machine>/YYYY/MM/YYYY-MM-DD.json`.
- [x] 2.6 Implement discovery of available source dates, reconstruction of missing dates, regeneration of the open UTC day, and explicit repair handling for closed days.
- [x] 2.7 Add tests for first backfill, a gap between existing days, corrupt or absent local state, unchanged reruns, and protection of closed days.

## 3. Collector and Quota Migration

- [x] 3.1 Restrict collector configuration to the active publisher identities `angel-mac` and the new M5 Mac, reject the retired legacy Mac before scanning or writing, and retain operational checkout path, adapter selection, and external Git credentials; verify with focused config/CLI tests only.
- [x] 3.2 Replace `HttpIngestClient` orchestration with snapshot generation and validation, preserving records only in memory until aggregation completes.
- [x] 3.3 Update dry-run output to preview days and aggregate metrics without writing snapshots, running Git, contacting TokenViewer endpoints, or exposing individual records.
- [x] 3.4 Update collector status to report identity, source coverage, snapshot coverage, missing days, last run, and any pending publication commit without sensitive values.
- [x] 3.5 Replace Copilot quota transport with a closed sanitizer that retains only provider, capture time, percentage, plan, and renewal while discarding login and the original payload.
- [x] 3.6 Integrate best-effort sanitized quota samples into the daily snapshot and add tests for complete, partial, unknown-field, missing-token, revoked-token, and network-failure responses.
- [x] 3.7 Remove collector uses and shared contracts for `serverUrl`, machine tokens, HTTP usage batches, and quota ingestion after all local-path tests pass.

## 4. Local Dashboard Data Layer

- [x] 4.1 Implement static Vite discovery and validated loading of all daily snapshot JSON files without a shared versioned manifest.
- [x] 4.2 Update the local query repository and machine filters to expose all three valid snapshot identities, including the read-only retired legacy Mac, while preserving combined agent, provider, model, and date filtering.
- [x] 4.3 Implement local summary, daily-series, model-breakdown, calendar-heatmap, and hourly-heatmap queries over hourly rows, including controlled IANA timezone errors.
- [x] 4.4 Implement local quota queries grouped by machine and provider with latest values and deduplicated history, without account identity.
- [x] 4.5 Replace HTTP hooks with the local repository while preserving compatible aggregate response shapes and loading/error behavior.
- [x] 4.6 Remove the dashboard Bearer token gate, API client dependencies, health check, and individual-record drill-down surfaces.
- [x] 4.7 Update Copilot quota cards to identify the machine, preserve gauge, plan, renewal, and sparkline, and remove all login assumptions.
- [x] 4.8 Update focused dashboard fixtures and tests to cover all existing views, combined filters, all three identities, retired legacy Mac visibility, empty ranges, unknown prices, timezone conversion, invalid snapshots, and absence of login or individual data; do not require a build or full repository suite.
- [x] 4.9 Add focused dashboard integration coverage that loads representative local snapshots and asserts that no `/api/v1/*` request or public-hosting configuration is used, without requiring a production build or full repository suite.

## 5. Git Publisher and macOS Scheduling

- [x] 5.1 Update publisher preflight for a dedicated clean checkout on `master`, expected private remote, and exclusive folder ownership so only `angel-mac` and the new M5 Mac may publish while the retired legacy Mac is rejected before generation or Git; whole-set snapshot validation MUST still accept its historical folder.
- [x] 5.2 Implement pending-commit recovery, `git pull --rebase origin master`, local generation, full validation, data-only commit creation, and `git push origin master` without force or destructive reset.
- [x] 5.3 Implement bounded pull-rebase/push retries that preserve an unpublished commit and stop for manual intervention on a real conflict.
- [x] 5.4 Update focused temporary-remote integration tests for no-op runs, successful publication, concurrent disjoint commits from `angel-mac` and the new M5 Mac, retired-identity rejection, non-fast-forward retry, exhausted retries, network failure, conflict, and pending-commit recovery; do not run a build or full repository suite.
- [x] 5.5 Restrict the `launchd` plist installer to `angel-mac` and the new M5 Mac, retaining daily scheduling, explicit PATH and working directory, local logs, and no embedded credentials, and add focused checks that the retired legacy Mac fails before any plist is created or loaded.
- [x] 5.6 Update installation, status, log inspection, manual-run, disable, and uninstall documentation for the two active Macs and their dedicated `master` checkouts, explicitly documenting that the retired legacy Mac has no installation or publication path.

## 6. CI and Operational Validation

- [x] 6.1 Add CI that runs whole-snapshot validation, privacy checks, unit/integration tests, typecheck, and applicable monorepo builds on relevant changes to `master`.
- [x] 6.2 Add CI tests that fail on changes mixing machine folders in a data publication and ensure CI never rewrites or commits snapshots.
- [x] 6.3 Add representative sanitized snapshot fixtures for all three identities, including the retired legacy Mac and active new M5 Mac, and use bounded validation timing/size checks that do not require a build or full repository suite.
- [x] 6.4 Document the daily failure procedure for invalid data, Git conflicts, lost network, expired credentials, and a preserved local commit.

## 7. Historical Backfill and Equivalence Gate

- [x] 7.1 Implement a one-time read-only SQLite migration importer that emits only aggregated snapshots for the selected machine and never copies raw rows, login, payloads, paths, sessions, projects, hashes, or credentials.
- [x] 7.2 Update the equivalence report to compare strict metrics only over overlapping SQLite/snapshot coverage, classify valid snapshot-only dates outside legacy coverage as expected additions, and preserve unresolved mismatch reporting inside overlap for requests, token categories, costs, unpriced requests, and quotas; verify with focused migration tests only.
- [x] 7.3 Update focused migration fixtures/tests so SQLite import and comparison accept the retired legacy Mac, keep its already imported aggregate snapshots immutable, do not assign legacy history to the new M5 Mac, and retain duplicate-row, malformed-row, privacy, and strict folder-ownership coverage without a build or full suite.
- [x] 7.4 Complete the local-source backfill for `angel-mac`, accept the already imported aggregate SQLite snapshots as the complete available history for the retired legacy Mac, require no legacy backfill for the new M5 Mac, and validate the resulting snapshot set with bounded commands.
- [x] 7.5 Regenerate and review equivalence classifications: record the 137 metrics from five newer `angel-mac` dates as expected additions outside SQLite coverage, retain only non-sensitive explanations, and block cutover for every unresolved mismatch within overlap; do not mark complete from the prior report claim.
- [x] 7.6 Validate every dashboard view and filter against the retired legacy Mac, complete `angel-mac` backfill, and representative or first-published new M5 Mac data using focused dashboard and equivalence checks; record only non-sensitive discrepancies and do not require a full repository suite or build.

## 8. Daily Granularity and Schema v2

- [x] 8.1 Raise `SNAPSHOT_SCHEMA_VERSION` to `2` in `packages/core` and make the validator accept only version 2, rejecting version 1 and any residual hour property; verify with focused core unit tests only.
- [x] 8.2 Replace the hourly usage row type with a daily row keyed by agent, provider and model, removing the hour field from the type, the serializer, the aggregate key and the derived-total invariants.
- [x] 8.3 Implement `Europe/Madrid` local-day assignment for record aggregation, open-day computation (`openDate`), closed-day protection and `quotaSamples.takenAt` truncation to a date without time; add focused tests covering a DST-summer late-evening record, a DST-winter record and a day-boundary record.
- [x] 8.4 Update core fixtures and focused unit tests to schema v2 daily rows, date-only `takenAt`, and rejection of v1 documents and hour fields; these checks MUST NOT require a build or full repository suite.
- [x] 8.5 Update collector aggregation, deterministic serialization and atomic writes to produce v2 daily snapshots, and update the collector dry-run and status output to report days and daily aggregate rows without any hourly breakdown.
- [x] 8.6 Retire the hourly heatmap from the dashboard: remove the 7×24 view, its IANA timezone parameter and its timezone conversion. PRESERVE the active-metric selector in the global filters bar, which now drives only the annual calendar heatmap over daily totals.
- [x] 8.7 Update the local query repository, hooks and focused dashboard tests for daily rows, removing hourly-heatmap coverage and timezone-conversion coverage while preserving summary, daily series, calendar heatmap, models breakdown and quota coverage.
- [x] 8.8 Update the whole-set validation command and CI to fail on any `schemaVersion = 1` file, and confirm no text or anonymization check is added to the CI gate.

## 9. One-Time v1 to v2 Snapshot Migration

- [x] 9.1 Implement a one-time migration script under `scripts/migration/` following the existing pattern (module, test, `tsconfig.json`, root `migration:*` / `test:migration` / `typecheck:migration` scripts) that converts v1 snapshots to v2.
- [x] 9.2 In the migration, convert each v1 hourly row's UTC hour to its `Europe/Madrid` local day BEFORE collapsing the hour, then recombine rows landing on the same day and `agent/provider/model` key and truncate `takenAt` to the local date.
- [x] 9.3 Add focused migration tests for day-boundary reassignment, row recombination, quota `takenAt` truncation, idempotence and rejection of already-migrated input; do not require a build or full repository suite.
- [x] 9.4 Run the migration over the 310 existing v1 snapshots, write them under the renamed machine paths, and validate the whole resulting set against schema v2 with bounded commands.
- [x] 9.5 Port the one-time SQLite importer `scripts/migration/sqlite-snapshots.ts` and its test to the schema v2 daily row shape (no `hour` field; `agent`/`provider`/`model` carried on the daily usage row) so that `pnpm typecheck:migration` and `pnpm test:migration` pass; the importer MUST stay read-only over the legacy database and its behavior MUST otherwise remain unchanged.
- [x] 9.6 Regenerate the equivalence report by comparing the migrated v2 daily totals against the pre-migration v1 snapshot files recovered from Git history, which are the only remaining comparison source now that the legacy SQLite database no longer exists on any machine; classify and document the expected UTC-to-`Europe/Madrid` day-boundary reassignments as differences distinct from unresolved mismatches, prove that the v1 to v2 migration preserved totals within those documented reassignments, and cover the comparison with a focused test without requiring a build or full repository suite. This task MUST complete before task 10.4, which strips the v1 snapshots from Git history.
- [x] 9.7 After retaining the completed migration and equivalence reports/evidence from tasks 9.4 and 9.6, remove the one-time v1→v2 migration and v1↔v2 equivalence tools, their tests, dedicated TypeScript configuration and root package scripts; rewrite `equivalence-report.md`, all current and historical OpenSpec content, docs, code, tests and every other tracked final-tree file to replace the pre-anonymization identities with neutral retired-legacy-Mac/new-M5-Mac wording while preserving `angel-mac`; and update the focused CI check to scan the entire tracked final tree with no exclusion for `openspec/changes/` or the removed tools, proving that no pre-anonymization identity or former-employer literal remains. This task MUST complete before task 10.4.

## 10. Identity Rename and Public Repository Preparation

- [x] 10.1 Replace the retired legacy Mac's pre-anonymization identity with `old-mac` and the new M5 Mac's pre-anonymization identity with `mac-m5` across snapshot paths, `packages/core` registry and path parsing, collector config and CLI, publisher preflight, `launchd` installer, dashboard filters and fixtures; leave `angel-mac` unchanged and unanonymized.
- [x] 10.2 Apply the same rename to tests, fixtures, documentation, `openspec/specs/` and `openspec/changes/archive/`, covering all files that contain the pre-anonymization identities outside `snapshots/`, and add a focused check that no code, test, fixture, doc or active spec still references them.
- [x] 10.3 Remove the private-remote expectation from publisher preflight while keeping the expected-remote and `master` branch checks, update the focused publisher tests, and, while the repository remains private, verify the current collaborator list and write access prove that only `Angel-M-R` has admin/push; do not require or configure branch protection while private.
- [x] 10.4 Only after completed tasks 9.6, 9.7 and 11.1, re-verify that only `Angel-M-R` has write access while the repository remains PRIVATE and unprotected, rewrite Git history with `git filter-repo` while preserving the seven original commits and removing all v1 snapshot data and every pre-anonymization identity or former-employer literal from each commit, verify the rewritten history is clean, and perform exactly one manual `git push --force-with-lease`; record the one-off operation and retain the focused proof that no automated code path can force-push.
- [x] 10.5 After task 10.4's successful clean private force-with-lease push and a fresh successful whole-set schema-v2 validation, make the repository PUBLIC and IMMEDIATELY enable and verify `master` branch protection with force pushes and deletion disabled while ordinary owner fast-forward direct pushes remain allowed. If protection cannot be enabled or verified after the visibility change, immediately restore private visibility if possible and MUST stop in all cases; do not leave the repository publicly exposed without the intended control.
  - Completion evidence (2026-07-31): the previously authorized one-off private rewrite push remains the only history rewrite; the external backup checksum and retained obsolete ref were reverified, the obsolete remote migration branch was deleted with a normal branch-delete push, all remaining remote history scans clean, and all 313 snapshots validate as schema v2.
  - Public-cutover evidence (2026-07-31): the repository is PUBLIC with `master` as default, only `Angel-M-R` has write access, and `master` protection disables force pushes and deletion while requiring neither pull requests nor status checks for ordinary owner fast-forward publication.
- [x] 10.6 Fix `docs/macos-snapshot-publisher.md` to insert the required `pnpm build` between `pnpm install` and `init` for a fresh clone, and make the daily job rebuild the collector's compiled dependencies after `git pull --rebase` so `dist/` never goes stale.

## 11. Reversible Cutover and Retirement

- [x] 11.1 Create and verify an offline, non-versioned copy of the pre-rewrite repository (for example a `git bundle` or a full mirror clone taken before the history rewrite in task 10.4), and document its restore location and integrity check without exposing the path or credentials in snapshots.
- [ ] 11.2 Recreate the operational checkout for `mac-m5` from scratch against the rewritten public repository, discarding the invalidated pre-anonymization checkout for the new M5 Mac whose identity and history are obsolete.
- [ ] 11.3 After `mac-m5` arrives and the migration branch is integrated normally, configure its dedicated operational `master` checkout and active identity, resume and install its daily `launchd` job (installation stays paused until this change is implemented), and verify one successful generation/publication in `snapshots/mac-m5/`; do not install anything for retired `old-mac`.
- [ ] 11.4 Install or confirm the dedicated operational `master` checkout and daily `launchd` job for `angel-mac`, then observe a bounded concurrent publication with `mac-m5` proving successful rebase/retry behavior, no cross-folder changes, and no writes under `snapshots/old-mac/`.
- [ ] 11.5 Verify the repository is public with collaborator permissions and branch protection enforcing write control on `master`, and obtain explicit cutover approval based on the complete three-identity schema v2 snapshot set, the v1 to v2 daily-total equivalence report including documented day-boundary reassignments, dashboard review, successful `mac-m5` publication, concurrent active-publisher evidence, and other focused evidence from completed migration tasks; final full-suite acceptance remains deferred until every planned task is complete.
- [ ] 11.6 Create the approved tag for the last known-good pre-migration system only after tasks 11.1-11.5 succeed and before deleting backend, Docker, or SQLite components.
- [ ] 11.7 Remove `apps/server`, its tests and migrations, TokenViewer-owned SQLite dependencies and scripts, Docker files, HTTP auth, ingestion contracts, and obsolete API client code while retaining read-only SQLite support required by third-party adapters; this task MUST remain blocked until 11.1-11.6 complete.
- [ ] 11.8 Update workspace scripts, dependencies, lockfile, documentation, and architecture references for the collector-plus-local-dashboard system, its schema v2 daily contract, its public-repository operating model, and its two-active/one-historical lifecycle.
- [ ] 11.9 Add focused post-retirement integrity checks and a local-dashboard smoke test proving that all three renamed identities load, that every snapshot is schema v2 with no hour field, and that no backend, Docker, TokenViewer-owned SQLite, `/api/v1/*`, application hosting, raw-data path, hourly-heatmap surface, or retired-identity publisher path remains, without requiring a build or full repository suite.
- [ ] 11.10 Test the documented rollback drill by disabling both active `launchd` jobs and verifying the approved pre-migration tag plus the offline pre-rewrite repository copy from task 11.1 can restore the prior system without force-pushing, deleting snapshots, or treating retired `old-mac` as a publisher.

## Final OpenSpec Verification Acceptance (Outside Planned Tasks)

After every planned task above is complete, `openspec-verifier` exclusively owns mandatory final acceptance. It MUST run full snapshot and privacy validation, the full repository test and typecheck suites, all applicable builds, and a local dashboard smoke check. Acceptance MUST confirm loading of all three renamed snapshot identities, schema v2 exclusivity with no residual v1 file or hour field, the recorded v1 to v2 daily-total equivalence result with its documented day-boundary reassignments and previously classified expected additions, publication only from `angel-mac` and `mac-m5`, absence of `/api/v1/*`, post-retirement integrity, and absence of any application hosting or raw-data path. This verification is not an implementation checkbox and MUST NOT be used as a completion condition for any planned task.
