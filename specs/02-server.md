# Spec 02 — Servidor central (`apps/server`)

## Objetivo

API HTTP (Hono sobre Node) con base de datos SQLite (Drizzle ORM) empaquetada en Docker. Recibe registros de los colectores, calcula coste con el catálogo de models.dev, expone endpoints de agregación y sirve el build estático del dashboard.

## Modelo de datos (SQLite)

```sql
machines (
  id            INTEGER PK,
  name          TEXT UNIQUE NOT NULL,        -- "macbook-angel"
  os            TEXT,                        -- "darwin" | "linux"
  token_hash    TEXT NOT NULL,               -- sha256 del machineToken
  created_at    TEXT NOT NULL,
  last_seen_at  TEXT
)

usage_records (
  id                 INTEGER PK,
  machine_id         INTEGER NOT NULL REFERENCES machines(id),
  record_hash        TEXT NOT NULL,          -- dedup, ver abajo
  agent              TEXT NOT NULL,          -- "claude", "codex", ...
  provider           TEXT,                   -- "anthropic", "openai", ...
  model              TEXT,
  ts                 TEXT NOT NULL,          -- ISO 8601 UTC del request
  session            TEXT,
  project            TEXT,
  input_tokens       INTEGER NOT NULL DEFAULT 0,
  output_tokens      INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens   INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd           REAL,                   -- estimado al ingerir (NULL si sin precio)
  billed_cost_usd    REAL,                   -- solo opencode lo trae real
  pricing_source     TEXT,                   -- "catalog" | "fallback" | "stored" | "unknown"
  UNIQUE (machine_id, record_hash)
)
-- índices: (ts), (machine_id, ts), (agent, ts), (model, ts)

pricing_catalog (                            -- caché de models.dev
  fetched_at  TEXT NOT NULL,
  payload     TEXT NOT NULL                  -- JSON completo
)
```

**`record_hash`**: `sha256(agent | session | requestId-o-messageId | ts | inputTokens | outputTokens)` calculado por el collector. Garantiza ingesta idempotente vía `INSERT ... ON CONFLICT DO NOTHING`.

**Timestamps**: siempre UTC en la BD. La conversión a hora local (para el heatmap) la hace el dashboard con la zona del navegador.

## Pricing

Porte de `references/devrage/src/pricing/index.ts`:
- Catálogo de `https://models.dev/api.json`, cacheado en la tabla `pricing_catalog` con TTL de 7 días y fallback a versión caducada si el fetch falla.
- Fórmula por millón de tokens: `input·rate_in + cache_read·rate_cr + cache_write·rate_cw + (output+reasoning)·rate_out`, con fallback de tarifas de caché a la de input, alias de proveedor/modelo y tiers de contexto.
- El coste se calcula **al ingerir** y queda congelado (el histórico no cambia si el catálogo cambia). Endpoint de mantenimiento `POST /api/v1/admin/reprice` recalcula todo con el catálogo vigente.

## API

Auth: `Authorization: Bearer <token>`. Tokens de máquina para `/ingest`; un `ADMIN_TOKEN` (env) para admin y, opcionalmente, para el dashboard (`DASHBOARD_TOKEN`, si no se define el dashboard es abierto en la red local).

| Ruta | Descripción |
|---|---|
| `POST /api/v1/machines/register` | Alta de máquina (requiere ADMIN_TOKEN), devuelve `machineToken` |
| `POST /api/v1/ingest` | Lote `{records: UsageRecord[]}` → `{accepted, duplicates}` |
| `GET /api/v1/machines` | Lista con last_seen y totales |
| `GET /api/v1/stats/summary?from&to&...` | Totales: tokens por tipo, coste, requests, nº modelos |
| `GET /api/v1/stats/daily?from&to&groupBy=agent\|model\|machine&...` | Serie por día para las gráficas |
| `GET /api/v1/stats/heatmap?from&to&metric=tokens\|cost\|requests&tz=Europe/Madrid&...` | Matriz 7×24 (día de semana × hora) |
| `GET /api/v1/stats/models?from&to&...` | Desglose por modelo |
| `GET /api/v1/records?from&to&limit&cursor&...` | Drill-down paginado |
| `GET /health` | Liveness |

Filtros comunes en todos los `stats/*`: `machine`, `agent`, `provider`, `model` (repetibles), `from`/`to` (ISO date).

Toda la agregación se hace en SQL (`strftime` para día/hora); el heatmap acepta `tz` para agrupar por hora local en servidor.

## Docker

- `docker/Dockerfile`: build multi-stage (pnpm build de server + web → imagen `node:22-slim`), el server sirve `apps/web/dist` como estáticos.
- `docker/docker-compose.yml`: un servicio, puerto `8484`, volumen `./data:/data` (SQLite en `/data/tokenviewer.db`), env `ADMIN_TOKEN`, `DASHBOARD_TOKEN?`, `PORT`.

## Criterios de aceptación

- Reenviar el mismo lote dos veces → `duplicates = n`, cero filas nuevas.
- `stats/daily` sobre 1M de registros responde en < 500 ms (índices sobre ts).
- Contenedor levanta con `docker compose up` y persiste tras recrearse (volumen).
- Registro sin precio en catálogo → `cost_usd NULL`, contado como "sin precio" en summary, nunca inventado.
