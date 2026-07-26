## Context

La fase 1 dejó `packages/core` (tipo `UsageRecord`, esquemas zod) y `packages/adapters` funcionando, con el colector en modo local (`--dry-run`). No existe todavía el punto de consolidación: esta fase implementa `apps/server` según `specs/02-server.md` (fuente principal), más el envío real desde `apps/collector` (`specs/01-collector.md`, sección "Envío al servidor").

Restricciones y contexto:

- Monorepo pnpm TypeScript; el servidor debe correr en Docker autocontenido (API + SQLite en un contenedor, volumen para la BD).
- Referencia obligada: `references/devrage/src/pricing/index.ts` (fórmula de precios, alias, tiers de contexto, caché con TTL) — se porta, no se importa; `references/` no se toca.
- Despliegue doméstico (red local/VPN): auth mínima por Bearer tokens, sin multi-usuario.
- El dashboard (fase 3) consumirá esta API y será servido por este mismo servidor como estáticos.

## Goals / Non-Goals

**Goals:**

- API Hono sobre Node (`@hono/node-server`) con SQLite vía Drizzle ORM y migraciones aplicadas al arrancar.
- Ingesta idempotente por `record_hash` con respuesta `{accepted, duplicates}` fiable.
- Coste calculado al ingerir con catálogo models.dev cacheado en BD; endpoint admin de reprice.
- Agregación íntegramente en SQL (summary, daily, heatmap con `tz`, models, records paginado); `stats/daily` < 500 ms con 1M de filas.
- Imagen Docker multi-stage que sirve también el build del dashboard; persistencia por volumen.
- Colector: envío por lotes con gzip, avance de cursor solo tras 2xx, backfill inicial completo, comando `init` que registra la máquina.

**Non-Goals:**

- Dashboard web (fase 3): aquí solo se sirve `apps/web/dist` si existe.
- Multi-usuario, HTTPS/TLS (se asume red local o reverse proxy externo), rate limiting.
- Websockets/tiempo real; Copilot y APIs cloud de proveedores (fase 4).
- Otros motores de BD (Postgres, etc.): SQLite es decisión cerrada.

## Decisions

### D1 — Esquema SQLite (Drizzle) exactamente como en specs/02-server.md

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
  record_hash        TEXT NOT NULL,          -- calculado por el collector
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

- Se define en Drizzle (`sqliteTable`) con migraciones generadas por `drizzle-kit` y aplicadas al arrancar el proceso (idempotente para Docker).
- Driver: `better-sqlite3` (síncrono, transacciones baratas, el estándar con Drizzle en Node). Alternativa `node:sqlite` descartada por soporte de Drizzle aún menos maduro. Pragmas al abrir: `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout`.
- Timestamps siempre UTC (`TEXT` ISO 8601) en la BD; la conversión a hora local es cosa del consumidor (heatmap acepta `tz`, ver D5).
- `record_hash` lo calcula el colector: `sha256(agent | session | requestId-o-messageId | ts | inputTokens | outputTokens)`. El servidor lo trata como opaco; la unicidad es por `(machine_id, record_hash)` para que dos máquinas distintas puedan aportar registros idénticos en contenido.

### D2 — Idempotencia: UNIQUE + ON CONFLICT DO NOTHING, duplicates por conteo de cambios

- `INSERT ... ON CONFLICT DO NOTHING` fila a fila dentro de una única transacción por lote; `accepted` = suma de `changes` (filas realmente insertadas), `duplicates = recibidos - accepted`.
- Alternativa descartada: `INSERT OR IGNORE` masivo + comparar `total_changes` (equivalente en SQLite, pero el conteo por sentencia con Drizzle/better-sqlite3 es más explícito y permite deduplicar también dentro del propio lote sin lógica extra).
- El lote entero se procesa en transacción: o se confirma completo o el colector reintenta (los reintentos son inocuos gracias al dedupe).
- Cualquier respuesta 2xx confirma el lote para el colector (avanza cursor); un fallo (red o 5xx) no avanza el cursor y el próximo `run` reenvía.

### D3 — Coste congelado al ingerir + reprice explícito (vs. calcular al leer)

- **Decisión**: `cost_usd` y `pricing_source` se calculan en el momento de la ingesta con el catálogo vigente y quedan congelados. Un cambio posterior del catálogo NO altera el histórico.
- **Por qué**: las consultas de agregación se reducen a `SUM(cost_usd)` en SQL puro (clave para el objetivo de < 500 ms sobre 1M filas); el histórico es estable y auditable (el coste refleja la tarifa vigente cuando se produjo la ingesta).
- **Alternativa descartada**: calcular el coste al leer (join contra el catálogo en cada query). Más "fresco" pero incompatible con agregación SQL simple, más lento, y hace que los totales históricos cambien silenciosamente.
- **Mitigación de la desventaja** (catálogo corregido a posteriori): `POST /api/v1/admin/reprice` recalcula `cost_usd`/`pricing_source` de TODO el histórico con el catálogo vigente, en transacción, y devuelve el número de filas actualizadas. Es una operación explícita de mantenimiento, no automática.
- `billed_cost_usd` (solo opencode lo trae real) nunca se recalcula: viene del adaptador y se conserva tal cual.

### D4 — Motor de precios: porte de devrage con caché en BD

Porte de `references/devrage/src/pricing/index.ts` a `apps/server/src/pricing/` con estos cambios:

- La caché pasa del fichero en `~/.cache` a la tabla `pricing_catalog` (fila única con `fetched_at` + `payload` JSON). Mismo TTL de 7 días y misma cascada: caché fresca → fetch de `https://models.dev/api.json` (timeout corto) → caché caducada (stale) → fallbacks embebidos.
- Se conserva intacta la lógica de resolución: normalización de proveedor/modelo, `PROVIDER_ALIASES`/`MODEL_ALIASES`, split `provider/model`, inferencia por prefijo (`gpt-*`→openai, `claude-*`→anthropic), tabla `FALLBACK_COSTS` embebida y selección de tiers de contexto (`tiers` tipo `context` + `context_over_200k`).
- Fórmula (tarifas por millón de tokens, caché con fallback a tarifa de input):

  `cost_usd = (input·rate_in + cache_read·rate_cr + cache_write·rate_cw + (output+reasoning)·rate_out) / 1e6`

- Si no se resuelven tarifas: `cost_usd = NULL` y `pricing_source = "stored"` (si trae `billed_cost_usd > 0`) o `"unknown"`. Nunca se inventa un coste; summary expone esos requests como "sin precio" (`unpricedRequests`).
- El catálogo se carga una vez y se memoiza en proceso; se refresca perezosamente al expirar el TTL (primera ingesta/reprice que lo encuentre caducado).

### D5 — Agregación en SQL con `strftime`; heatmap con `tz` resuelto en servidor

- Todos los `stats/*` son consultas SQL con `GROUP BY` sobre expresiones `strftime` (día: `strftime('%Y-%m-%d', ts)`; heatmap: `strftime('%w', ...)` × `strftime('%H', ...)`). Nada de agregar en JS: los índices `(ts)`, `(machine_id, ts)`, `(agent, ts)`, `(model, ts)` sostienen el objetivo de rendimiento.
- **Heatmap y `tz`**: SQLite no conoce zonas IANA, así que el servidor calcula el offset de la zona pedida con `Intl.DateTimeFormat` (Node ICU) y agrupa por `datetime(ts, '<±HH:MM>')`. Para rangos que cruzan cambio de horario, el rango se parte por offset (a lo sumo 2–3 subconsultas UNION) para que cada tramo use su offset correcto. `tz` inválida → 400. Alternativa descartada: devolver UTC y que el cliente convierta (rompería las celdas del heatmap servido agregado); cargar extensión de timezones en SQLite (dependencia nativa extra injustificada).
- Filtros comunes (`machine`, `agent`, `provider`, `model` repetibles; `from`/`to` fecha ISO) se compilan a un `WHERE` común (IN (...) y rango sobre `ts`) reutilizado por todos los endpoints, validado con zod.
- `records` pagina por cursor keyset `(ts, id)` codificado en base64 (`?cursor=`), orden descendente por defecto; sin OFFSET para que no degrade con profundidad.
- `summary` devuelve tokens por tipo, `cost_usd` total (`SUM` ignora NULL por semántica SQL), `billed_cost_usd`, nº de requests, nº de requests sin precio (`COUNT(*) FILTER (WHERE cost_usd IS NULL)`) y nº de modelos distintos.

### D6 — Auth por Bearer tokens con hash en BD

- Tres niveles: `ADMIN_TOKEN` (env, obligatorio) para `machines/register`, `admin/reprice` y `machines`; `machineToken` por máquina para `ingest`; `DASHBOARD_TOKEN` (env, opcional) para `stats/*` y `records` — si no está definido, esos endpoints quedan abiertos (red local).
- `machineToken` se genera en el registro (`tv_` + 32 bytes aleatorios hex), se devuelve UNA sola vez y solo se persiste `sha256(token)` en `machines.token_hash`. La verificación en `/ingest` hashea el Bearer recibido y busca la máquina; comparación en tiempo constante (`timingSafeEqual`).
- Registrar un `name` ya existente re-emite token para esa máquina (rotación) en vez de fallar: simplifica reinstalaciones sin endpoint extra. Requiere `ADMIN_TOKEN`, así que no debilita el modelo.
- `last_seen_at` se actualiza en cada ingesta autenticada.
- Alternativa descartada: guardar tokens en claro (innecesario) o JWT (sin beneficio con estado en BD y un solo emisor).

### D7 — Estáticos del dashboard y estructura de la app

- Hono `serveStatic` sobre un directorio configurable (`WEB_DIST`, por defecto `apps/web/dist` en dev y `/app/web` en la imagen), con fallback a `index.html` para rutas no-API (SPA). Si el directorio no existe (fase 3 aún no hecha), el servidor arranca igual y `/` devuelve 404 informativo; la API no depende del dashboard.
- Estructura: `apps/server/src/{index.ts, app.ts, db/{schema.ts, client.ts, migrations/}, auth.ts, pricing/, routes/{machines.ts, ingest.ts, stats.ts, records.ts, admin.ts}}`. `app.ts` exporta la app Hono sin listener para poder testearla con inyección de requests (`app.request()`), sin puerto real.
- Config por env con valores por defecto: `PORT=8484`, `DB_PATH=/data/tokenviewer.db` (en dev `./data/tokenviewer.db`), `ADMIN_TOKEN` (sin default: el server rehúsa arrancar si falta), `DASHBOARD_TOKEN?`, `WEB_DIST?`.

### D8 — Docker multi-stage

- `docker/Dockerfile`: stage build con `node:22` + corepack/pnpm → `pnpm install` del workspace, `pnpm build` de `apps/server` y `apps/web`; stage final `node:22-slim` solo con el dist del server, `node_modules` de producción (incluye el binario nativo de `better-sqlite3` compilado en build) y `apps/web/dist` copiado a `/app/web`.
- `docker/docker-compose.yml`: un servicio, `ports: "8484:8484"`, `volumes: ./data:/data`, `environment: ADMIN_TOKEN` (requerido), `DASHBOARD_TOKEN?`, `PORT?`. Healthcheck contra `GET /health`. Recrear el contenedor no pierde datos: la BD vive en el volumen.

### D9 — Cliente de ingesta en el colector

- Completa la interfaz definida en fase 1: trocea los `UsageRecord` en lotes de ≤ 1000, serializa JSON `{records: [...]}`, comprime con gzip (`Content-Encoding: gzip`; el servidor descomprime), envía con `Authorization: Bearer <machineToken>` y reintento simple.
- Semántica de cursor: solo un 2xx confirma el lote y persiste el avance de cursores; ante error de red o no-2xx el proceso termina con exit code ≠ 0 y el siguiente `run` reenvía desde el último cursor confirmado (sin pérdida; los duplicados los absorbe el servidor).
- `tokenviewer-collector init`: pide `serverUrl` y `ADMIN_TOKEN` (solo se usa en ese momento, no se guarda), llama a `machines/register` con `os.hostname()`/plataforma y persiste `machineToken` en `~/.config/tokenviewer/config.json`.
- Los esquemas de request/response del API (`IngestRequest`, `IngestResponse`, register) viven en `packages/core` (zod) y los comparten colector y servidor.

## Risks / Trade-offs

- [El coste congelado queda obsoleto si models.dev corrige tarifas] → `POST /api/v1/admin/reprice` recalcula todo el histórico bajo demanda; `pricing_source` permite auditar de dónde salió cada coste.
- [models.dev caído o inaccesible en la primera ingesta sin caché] → cascada stale-cache → fallbacks embebidos → `cost_usd NULL` con `pricing_source` honesto; la ingesta nunca falla por pricing.
- [SQLite con escrituras concurrentes (varios colectores a la vez)] → un solo proceso escritor, WAL + `busy_timeout`, lotes en transacciones cortas; la escala doméstica (pocas máquinas, cada 15 min) está muy por debajo del límite.
- [`stats/daily` > 500 ms al crecer el volumen] → índices sobre `ts` y combinados, agregación 100% SQL, sin OFFSET; verificación con un seed sintético de 1M filas en los criterios de aceptación.
- [Heatmap con `tz` en fechas que cruzan DST] → partición del rango por offset (D5); caso degenerado documentado y cubierto por test con `Europe/Madrid`.
- [Token de máquina filtrado] → solo permite ingerir (no leer ni administrar); rotación re-registrando la máquina con `ADMIN_TOKEN`; en BD solo hay hashes.
- [Binario nativo de `better-sqlite3` en Docker] → se compila en el stage de build con la misma versión de Node que la imagen final (22), evitando incompatibilidades ABI.
- [Dashboard aún inexistente (fase 3)] → el servido de estáticos es tolerante a directorio ausente; la imagen Docker construye `apps/web` solo si existe, sin bloquear esta fase.

## Migration Plan

1. No hay datos previos que migrar: la BD se crea desde cero con las migraciones de Drizzle al primer arranque (`docker compose up`).
2. Despliegue: construir imagen, definir `ADMIN_TOKEN`, `docker compose up -d`; registrar cada máquina con `tokenviewer-collector init`; primer `run` hace backfill completo del histórico local.
3. Rollback: parar el contenedor; el volumen `./data` conserva la BD. Volver a una imagen anterior es seguro (el esquema solo se crea/avanza, no se borra).

## Open Questions

- ¿`GET /api/v1/machines` bajo `ADMIN_TOKEN` o también accesible con `DASHBOARD_TOKEN`? Se implementa con ADMIN_TOKEN según spec; si el dashboard (fase 3) necesita la lista para filtros, se relajará a DASHBOARD_TOKEN en esa fase.
- Retención/compactación de `usage_records` a largo plazo: fuera de alcance en v1, revisar si la BD supera varios GB.
