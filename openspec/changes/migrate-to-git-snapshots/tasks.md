## 1. Snapshot Contract and Validation

- [x] 1.1 Split the closed machine registry in `packages/core` into snapshot identities (`angel-mac`, historical `old-mac`, `mac-m5`) and active publisher identities (`angel-mac`, `mac-m5`), while retaining the daily snapshot, hourly usage, sanitized quota, and canonical unknown-dimension types.
- [x] 1.2 Update canonical path parsing and whole-set validation to accept all three snapshot identities, including historical `old-mac`, while preserving machine/date agreement, UTC membership, duplicate aggregate keys, ordering, finite non-negative values, and derived totals.
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

- [x] 3.1 Restrict collector configuration to active publisher identities `angel-mac` and `mac-m5`, reject historical `old-mac` before scanning or writing, and retain operational checkout path, adapter selection, and external Git credentials; verify with focused config/CLI tests only.
- [x] 3.2 Replace `HttpIngestClient` orchestration with snapshot generation and validation, preserving records only in memory until aggregation completes.
- [x] 3.3 Update dry-run output to preview days and aggregate metrics without writing snapshots, running Git, contacting TokenViewer endpoints, or exposing individual records.
- [x] 3.4 Update collector status to report identity, source coverage, snapshot coverage, missing days, last run, and any pending publication commit without sensitive values.
- [x] 3.5 Replace Copilot quota transport with a closed sanitizer that retains only provider, capture time, percentage, plan, and renewal while discarding login and the original payload.
- [x] 3.6 Integrate best-effort sanitized quota samples into the daily snapshot and add tests for complete, partial, unknown-field, missing-token, revoked-token, and network-failure responses.
- [x] 3.7 Remove collector uses and shared contracts for `serverUrl`, machine tokens, HTTP usage batches, and quota ingestion after all local-path tests pass.

## 4. Local Dashboard Data Layer

- [x] 4.1 Implement static Vite discovery and validated loading of all daily snapshot JSON files without a shared versioned manifest.
- [x] 4.2 Update the local query repository and machine filters to expose all three valid snapshot identities, including read-only historical `old-mac`, while preserving combined agent, provider, model, and date filtering.
- [x] 4.3 Implement local summary, daily-series, model-breakdown, calendar-heatmap, and hourly-heatmap queries over hourly rows, including controlled IANA timezone errors.
- [x] 4.4 Implement local quota queries grouped by machine and provider with latest values and deduplicated history, without account identity.
- [x] 4.5 Replace HTTP hooks with the local repository while preserving compatible aggregate response shapes and loading/error behavior.
- [x] 4.6 Remove the dashboard Bearer token gate, API client dependencies, health check, and individual-record drill-down surfaces.
- [x] 4.7 Update Copilot quota cards to identify the machine, preserve gauge, plan, renewal, and sparkline, and remove all login assumptions.
- [x] 4.8 Update focused dashboard fixtures and tests to cover all existing views, combined filters, all three identities, historical `old-mac` visibility, empty ranges, unknown prices, timezone conversion, invalid snapshots, and absence of login or individual data; do not require a build or full repository suite.
- [x] 4.9 Add focused dashboard integration coverage that loads representative local snapshots and asserts that no `/api/v1/*` request or public-hosting configuration is used, without requiring a production build or full repository suite.

## 5. Git Publisher and macOS Scheduling

- [x] 5.1 Update publisher preflight for a dedicated clean checkout on `master`, expected private remote, and exclusive folder ownership so only `angel-mac` and `mac-m5` may publish while `old-mac` is rejected before generation or Git; whole-set snapshot validation MUST still accept its historical folder.
- [x] 5.2 Implement pending-commit recovery, `git pull --rebase origin master`, local generation, full validation, data-only commit creation, and `git push origin master` without force or destructive reset.
- [x] 5.3 Implement bounded pull-rebase/push retries that preserve an unpublished commit and stop for manual intervention on a real conflict.
- [x] 5.4 Update focused temporary-remote integration tests for no-op runs, successful publication, concurrent disjoint commits from `angel-mac` and `mac-m5`, retired-identity rejection, non-fast-forward retry, exhausted retries, network failure, conflict, and pending-commit recovery; do not run a build or full repository suite.
- [x] 5.5 Restrict the `launchd` plist installer to `angel-mac` and `mac-m5`, retaining daily scheduling, explicit PATH and working directory, local logs, and no embedded credentials, and add focused checks that `old-mac` fails before any plist is created or loaded.
- [x] 5.6 Update installation, status, log inspection, manual-run, disable, and uninstall documentation for the two active Macs and their dedicated `master` checkouts, explicitly documenting that retired `old-mac` has no installation or publication path.

## 6. CI and Operational Validation

- [x] 6.1 Add CI that runs whole-snapshot validation, privacy checks, unit/integration tests, typecheck, and applicable monorepo builds on relevant changes to `master`.
- [x] 6.2 Add CI tests that fail on changes mixing machine folders in a data publication and ensure CI never rewrites or commits snapshots.
- [x] 6.3 Add representative sanitized snapshot fixtures for all three identities, including historical `old-mac` and active `mac-m5`, and use bounded validation timing/size checks that do not require a build or full repository suite.
- [x] 6.4 Document the daily failure procedure for invalid data, Git conflicts, lost network, expired credentials, and a preserved local commit.

## 7. Historical Backfill and Equivalence Gate

- [x] 7.1 Implement a one-time read-only SQLite migration importer that emits only aggregated snapshots for the selected machine and never copies raw rows, login, payloads, paths, sessions, projects, hashes, or credentials.
- [x] 7.2 Update the equivalence report to compare strict metrics only over overlapping SQLite/snapshot coverage, classify valid snapshot-only dates outside legacy coverage as expected additions, and preserve unresolved mismatch reporting inside overlap for requests, token categories, costs, unpriced requests, and quotas; verify with focused migration tests only.
- [x] 7.3 Update focused migration fixtures/tests so SQLite import and comparison accept historical `old-mac`, keep its already imported aggregate snapshots immutable, do not assign legacy history to `mac-m5`, and retain duplicate-row, malformed-row, privacy, and strict folder-ownership coverage without a build or full suite.
- [x] 7.4 Complete the local-source backfill for `angel-mac`, accept the already imported aggregate SQLite snapshots as the complete available history for retired `old-mac`, require no legacy backfill for `mac-m5`, and validate the resulting snapshot set with bounded commands.
- [x] 7.5 Regenerate and review equivalence classifications: record the 137 metrics from five newer `angel-mac` dates as expected additions outside SQLite coverage, retain only non-sensitive explanations, and block cutover for every unresolved mismatch within overlap; do not mark complete from the prior report claim.
- [x] 7.6 Validate every dashboard view and filter against historical `old-mac`, complete `angel-mac` backfill, and representative or first-published `mac-m5` data using focused dashboard and equivalence checks; record only non-sensitive discrepancies and do not require a full repository suite or build.

## 8. Reversible Cutover and Retirement

- [ ] 8.1 Create and verify an offline, non-versioned SQLite backup and document its restore location and integrity check without exposing the path or credentials in snapshots.
- [ ] 8.2 After `mac-m5` arrives and the migration branch is integrated normally, configure its dedicated operational `master` checkout and active identity, install its daily `launchd` job, and verify one successful generation/publication in `snapshots/mac-m5/`; do not install anything for retired `old-mac`.
- [ ] 8.3 Install or confirm the dedicated operational `master` checkout and daily `launchd` job for `angel-mac`, then observe a bounded concurrent publication with `mac-m5` proving successful rebase/retry behavior, no cross-folder changes, and no writes under `snapshots/old-mac/`.
- [ ] 8.4 Verify the repository is private and obtain explicit cutover approval based on the complete three-identity snapshot set, overlap-aware equivalence report, dashboard review, successful `mac-m5` publication, concurrent active-publisher evidence, and other focused evidence from completed migration tasks; final full-suite acceptance remains deferred until every planned task is complete.
- [ ] 8.5 Create the approved tag for the last known-good pre-migration system only after tasks 8.1-8.4 succeed and before deleting backend, Docker, or SQLite components.
- [ ] 8.6 Remove `apps/server`, its tests and migrations, TokenViewer-owned SQLite dependencies and scripts, Docker files, HTTP auth, ingestion contracts, and obsolete API client code while retaining read-only SQLite support required by third-party adapters; this task MUST remain blocked until 8.1-8.5 complete.
- [ ] 8.7 Update workspace scripts, dependencies, lockfile, documentation, and architecture references for the collector-plus-local-dashboard system and its two-active/one-historical lifecycle.
- [ ] 8.8 Add focused post-retirement integrity checks and a local-dashboard smoke test proving that all three identities load and that no backend, Docker, TokenViewer-owned SQLite, `/api/v1/*`, public-hosting, raw-data path, or retired-identity publisher path remains, without requiring a build or full repository suite.
- [ ] 8.9 Test the documented rollback drill by disabling both active `launchd` jobs and verifying the tag plus offline SQLite backup can restore the prior system without force-pushing, deleting snapshots, or treating retired `old-mac` as a publisher.

## Final OpenSpec Verification Acceptance (Outside Planned Tasks)

After every planned task above is complete, `openspec-verifier` exclusively owns mandatory final acceptance. It MUST run full snapshot and privacy validation, the full repository test and typecheck suites, all applicable builds, and a local dashboard smoke check. Acceptance MUST confirm loading of all three snapshot identities, strict equivalence inside overlapping coverage, expected-addition classification outside legacy coverage, publication only from `angel-mac` and `mac-m5`, absence of `/api/v1/*`, post-retirement integrity, and absence of any public-hosting or raw-data path. This verification is not an implementation checkbox and MUST NOT be used as a completion condition for any planned task.
