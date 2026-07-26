## Phase 2 Verification

Date: 2026-07-05
Machine: local development machine

Commands:

- `pnpm install`
- `pnpm build`
- `pnpm test`
- `ADMIN_TOKEN=dev-admin docker compose -f docker/docker-compose.yml build`
- `ADMIN_TOKEN=dev-admin docker compose -f docker/docker-compose.yml up -d`
- `curl http://127.0.0.1:8484/health`
- `docker run --rm docker-tokenviewer:latest` without `ADMIN_TOKEN`
- `tokenviewer-collector init --server-url http://127.0.0.1:8484 --admin-token dev-admin --machine-name test-machine`
- `tokenviewer-collector run --agents claude`

Results:

- Build: core, adapters, server, and collector compiled successfully.
- Tests: 31 tests passed across core, adapters, server, and collector.
- `stats/daily` benchmark over 1,000,000 synthetic rows: 151 ms.
- Docker image built successfully.
- Compose container started and `/health` returned `{"ok":true}`.
- Missing `ADMIN_TOKEN` exited with code 1 and a clear config error.
- Data persisted after container restart: a directly ingested row remained visible in `stats/summary`.
- Collector `init` registered a test machine and wrote config with `serverUrl`, `machineName`, and `machineToken`, without persisting `ADMIN_TOKEN`.
- First collector `run --agents claude`: 1,338 records sent, `{ accepted: 1338, duplicates: 0 }`.
- Second run with the same cursor state: 0 records sent.
- Retry with fresh cursor state and same machine token: 1,338 records resent, `{ accepted: 0, duplicates: 1338 }`.
