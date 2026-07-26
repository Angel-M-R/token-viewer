## Phase 1 Verification

Date: 2026-07-05
Machine: local development machine

Commands:

- `pnpm install`
- `pnpm build`
- `pnpm test`
- `pnpm --filter collector exec tokenviewer-collector --help`
- `pnpm --filter collector exec tokenviewer-collector run --dry-run --out /tmp/tokenviewer-dry-run.json`
- `pnpm --filter collector exec tokenviewer-collector run --dry-run --out /tmp/tokenviewer-dry-run-incremental.json`
- `pnpm --filter collector exec tokenviewer-collector status`

Results:

- Build: all three packages compiled successfully.
- Tests: 22 tests passed across core, adapters, and collector.
- Cold dry-run over local logs completed in 3.04s.
- Cold dry-run detected claude, codex, cursor, opencode, pi, and t3code; amp was not installed.
- Cold dry-run summary: 46,807 records, 681 scanned files, 0 warnings.
- Immediate incremental dry-run completed in 0.27s.
- Incremental dry-run skipped 680 unchanged files; one live Codex session changed during the check and produced 2 new records.
- `status` reported all detected agents, `lastRunAt`, and 681 cursor files.
- No agent source directories are written by the collector code path; tests assert source log mtime is unchanged in the dry-run E2E fixture.
