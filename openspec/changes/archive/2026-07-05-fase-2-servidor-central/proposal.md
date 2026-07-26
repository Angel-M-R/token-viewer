## Why

Tras la fase 1, cada PC extrae su uso de tokens en local pero no existe ningún punto central donde consolidarlo: no hay histórico compartido entre máquinas, ni cálculo de coste, ni una API de la que el futuro dashboard pueda leer. Esta fase construye el servidor central (`apps/server`) definido en `specs/02-server.md`, que es el prerequisito de la fase 3 (dashboard) y completa el flujo colector → servidor.

## What Changes

- Nueva app `apps/server`: API HTTP con Hono sobre Node y base de datos SQLite gestionada con Drizzle ORM (tablas `machines`, `usage_records`, `pricing_catalog` con sus índices).
- Registro de máquinas (`POST /api/v1/machines/register`, protegido por `ADMIN_TOKEN`) que emite un `machineToken` por máquina; solo se persiste su hash SHA-256. Listado de máquinas con `last_seen_at` y totales (`GET /api/v1/machines`).
- Ingesta idempotente (`POST /api/v1/ingest`, Bearer token de máquina): lotes de `UsageRecord` deduplicados por `record_hash` con `UNIQUE (machine_id, record_hash)` + `INSERT ... ON CONFLICT DO NOTHING`; respuesta `{accepted, duplicates}`.
- Motor de precios portado de `references/devrage/src/pricing/index.ts`: catálogo de models.dev cacheado en la tabla `pricing_catalog` (TTL 7 días, fallback a versión caducada), fórmula por millón de tokens con alias y tiers de contexto, coste congelado al ingerir (`cost_usd`, `pricing_source`) y endpoint admin `POST /api/v1/admin/reprice` para recalcular el histórico.
- Endpoints de agregación en SQL: `stats/summary`, `stats/daily` (con `groupBy`), `stats/heatmap` (matriz 7×24 con parámetro `tz`), `stats/models` y `records` paginado por cursor; filtros comunes `machine`/`agent`/`provider`/`model`/`from`/`to`. `GET /health` como liveness.
- Servido de estáticos del dashboard (`apps/web/dist`) desde el propio servidor, con `DASHBOARD_TOKEN` opcional.
- Empaquetado Docker: `docker/Dockerfile` multi-stage y `docker/docker-compose.yml` con puerto 8484, volumen `./data:/data` para la BD SQLite y variables `ADMIN_TOKEN`, `DASHBOARD_TOKEN?`, `PORT`.
- El colector (`apps/collector`) completa la interfaz de envío definida en fase 1: `POST {serverUrl}/api/v1/ingest` con Bearer `machineToken`, lotes de ≤ 1000 registros con gzip, avance de cursor solo tras 2xx y backfill completo en el primer arranque; comando `init` que registra la máquina y guarda el token.

## Capabilities

### New Capabilities

- `machine-registry`: alta de máquinas con emisión de tokens (hash SHA-256 en BD), autenticación Bearer por máquina y listado con actividad y totales.
- `usage-ingestion`: ingesta idempotente de lotes de `UsageRecord` con dedupe por `record_hash` y respuesta `{accepted, duplicates}`, incluida la parte cliente del colector (lotes, gzip, cursores).
- `pricing-engine`: catálogo de precios de models.dev cacheado, cálculo de coste congelado al ingerir y reprecio administrativo del histórico.
- `stats-api`: endpoints de agregación (`summary`, `daily`, `heatmap` con `tz`, `models`, `records` paginado) con filtros comunes, agregación en SQL.
- `docker-deployment`: imagen Docker multi-stage con servido de estáticos del dashboard, docker-compose con volumen persistente para SQLite y configuración por variables de entorno.

### Modified Capabilities

<!-- Ninguna: no existen specs previas en openspec/specs/ que cambien de requisitos. -->

## Impact

- Código nuevo: `apps/server` (API Hono, esquema Drizzle, motor de precios), `docker/` (Dockerfile, docker-compose.yml).
- Código modificado: `apps/collector` (implementación real del envío al servidor y del comando `init`); `packages/core` puede ampliar los esquemas zod compartidos de la API (`IngestRequest`/`IngestResponse`, respuestas de stats).
- Dependencias nuevas: `hono`, `@hono/node-server`, `drizzle-orm`, `better-sqlite3` (o driver equivalente), `drizzle-kit`.
- Sistemas: servicio HTTP en el puerto 8484 (Docker), fichero SQLite en `/data/tokenviewer.db` persistido por volumen, dependencia externa de `https://models.dev/api.json` (tolerante a fallos por caché).
- No se tocan `references/` ni `specs/`; el dashboard (`apps/web`) llega en fase 3 y consumirá esta API.
