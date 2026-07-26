## 1. Andamiaje de apps/server y esquema de BD

- [x] 1.1 Crear `apps/server` en el workspace pnpm (package.json, tsconfig, scripts `dev`/`build`/`test`) con dependencias `hono`, `@hono/node-server`, `drizzle-orm`, `better-sqlite3`, `drizzle-kit` y `zod`
- [x] 1.2 Definir el esquema Drizzle en `src/db/schema.ts` (`machines`, `usage_records` con `UNIQUE (machine_id, record_hash)`, `pricing_catalog`) y los índices `(ts)`, `(machine_id, ts)`, `(agent, ts)`, `(model, ts)`
- [x] 1.3 Generar migraciones con drizzle-kit y crear `src/db/client.ts`: apertura de la BD en `DB_PATH`, pragmas (`journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout`) y aplicación de migraciones al arrancar
- [x] 1.4 Crear `src/app.ts` (app Hono exportada sin listener, testeable con `app.request()`) y `src/index.ts` (carga de config por env con validación: rehusar arrancar sin `ADMIN_TOKEN`; `PORT` por defecto 8484) con `GET /health`
- [x] 1.5 Ampliar `packages/core` con los esquemas zod compartidos de la API: `IngestRequest`/`IngestResponse`, register request/response y tipos de respuesta de stats

## 2. Registro y autenticación de máquinas

- [x] 2.1 Implementar `src/auth.ts`: middleware Bearer para `ADMIN_TOKEN`, `DASHBOARD_TOKEN` opcional y resolución de máquina por `sha256(machineToken)` con comparación en tiempo constante
- [x] 2.2 Implementar `POST /api/v1/machines/register` (ADMIN_TOKEN): generación de `machineToken` (`tv_` + 32 bytes hex), persistencia solo del hash, re-registro por `name` existente = rotación de token
- [x] 2.3 Implementar `GET /api/v1/machines` (ADMIN_TOKEN): lista con `last_seen_at` y totales por máquina, sin exponer `token_hash`
- [x] 2.4 Tests: registro 401 sin admin, token devuelto una sola vez y solo hash en BD, rotación invalida el token anterior, listado sin secretos

## 3. Ingesta idempotente

- [x] 3.1 Implementar `POST /api/v1/ingest`: auth por token de máquina, soporte de body gzip (`Content-Encoding: gzip`), validación zod del lote, 400 sin insertar si no valida
- [x] 3.2 Inserción transaccional con `INSERT ... ON CONFLICT DO NOTHING` sobre `(machine_id, record_hash)`, conteo de `accepted` por filas realmente insertadas y respuesta `{accepted, duplicates}`; actualizar `last_seen_at`
- [x] 3.3 Tests de idempotencia: lote nuevo (accepted = n), reenvío íntegro (`duplicates = n`, cero filas nuevas), lote parcialmente duplicado, mismo `record_hash` desde dos máquinas distintas (ambos aceptados), token inválido → 401 sin escrituras

## 4. Motor de precios

- [x] 4.1 Portar `references/devrage/src/pricing/index.ts` a `src/pricing/`: resolución de tarifas (alias de proveedor/modelo, split `provider/model`, inferencia por prefijo, `FALLBACK_COSTS`), tiers de contexto y fórmula por millón de tokens
- [x] 4.2 Sustituir la caché de fichero por la tabla `pricing_catalog` (TTL 7 días, cascada fresh → fetch → stale → fallback embebido, timeout corto, memoización en proceso); un fallo de pricing nunca hace fallar la ingesta
- [x] 4.3 Integrar el pricing en la ingesta: `cost_usd` congelado + `pricing_source` por fila; sin tarifas → `cost_usd NULL` con `"stored"` (si `billed_cost_usd > 0`) o `"unknown"`; `billed_cost_usd` se conserva tal cual
- [x] 4.4 Implementar `POST /api/v1/admin/reprice` (ADMIN_TOKEN): recálculo transaccional de `cost_usd`/`pricing_source` de todo el histórico con el catálogo vigente, respuesta con filas actualizadas, `billed_cost_usd` intacto
- [x] 4.5 Tests de pricing: fórmula con tarifas de caché con fallback a input, tier de contexto largo, modelo desconocido → NULL/"unknown", opencode con billed → "stored", reprice corrige tarifas y resuelve NULL previos, cascada de caché (fresh/stale/fallback)

## 5. API de estadísticas

- [x] 5.1 Implementar el compilador de filtros comunes (`machine`/`agent`/`provider`/`model` repetibles, `from`/`to` ISO) validado con zod y compartido por todos los endpoints; 400 en parámetros inválidos; gate opcional por `DASHBOARD_TOKEN`
- [x] 5.2 Implementar `GET /api/v1/stats/summary`: tokens por tipo, coste estimado y facturado, requests, `unpricedRequests` (`cost_usd IS NULL`) y nº de modelos distintos, todo en SQL
- [x] 5.3 Implementar `GET /api/v1/stats/daily` con `groupBy=agent|model|machine` (`strftime('%Y-%m-%d', ts)`)
- [x] 5.4 Implementar `GET /api/v1/stats/heatmap` (matriz 7×24, `metric=tokens|cost|requests`): resolución del offset de `tz` IANA vía `Intl`, agrupación por hora local con partición del rango en cambios de horario, `tz` inválida → 400
- [x] 5.5 Implementar `GET /api/v1/stats/models` (desglose por modelo con tokens, costes y sin-precio) y `GET /api/v1/records` (keyset por `(ts, id)` desc, cursor opaco base64, sin OFFSET)
- [x] 5.6 Tests de stats: filtros combinados, summary con mezcla con/sin precio, daily agrupado, heatmap con `tz=Europe/Madrid` cruzando medianoche y DST, paginación estable sin repetidos/omitidos, 401 con `DASHBOARD_TOKEN` definido
- [x] 5.7 Benchmark: seed sintético de 1M de filas y verificación de `stats/daily` < 500 ms

## 6. Estáticos del dashboard y Docker

- [x] 6.1 Implementar servido de estáticos (`WEB_DIST`, fallback SPA a `index.html`, tolerante a directorio ausente con 404 informativo en `/`)
- [x] 6.2 Escribir `docker/Dockerfile` multi-stage (build workspace con pnpm → `node:22-slim` con dist del server, deps de producción con `better-sqlite3` compilado y `apps/web/dist` en `/app/web`)
- [x] 6.3 Escribir `docker/docker-compose.yml`: puerto 8484, volumen `./data:/data`, env `ADMIN_TOKEN`/`DASHBOARD_TOKEN?`/`PORT?`, healthcheck contra `/health`
- [x] 6.4 Verificar: `docker compose up` levanta y migra la BD, falta de `ADMIN_TOKEN` aborta con error claro, y los datos persisten tras `down` + `up` (volumen)

## 7. Envío desde el colector

- [x] 7.1 Implementar el cliente de ingesta en `apps/collector`: lotes ≤ 1000, body gzip, Bearer `machineToken`, avance de cursor solo tras 2xx, exit code ≠ 0 y cursor intacto ante fallo; backfill completo en primer arranque
- [x] 7.2 Implementar `tokenviewer-collector init`: prompts de `serverUrl` y `ADMIN_TOKEN` (no persistido), llamada a `machines/register`, escritura de `~/.config/tokenviewer/config.json` con `serverUrl`/`machineName`/`machineToken`
- [x] 7.3 Tests del colector: troceo 2500 → 3 lotes, fallo de red no avanza cursor y reintenta, reenvío absorbido por el servidor (duplicates), config sin `ADMIN_TOKEN`

## 8. Verificación de extremo a extremo

- [x] 8.1 Flujo completo contra el contenedor: `init` + `run` con logs reales → datos visibles en `stats/summary`; ejecutar `run` dos veces seguidas no produce duplicados en el servidor
- [x] 8.2 Repasar los criterios de aceptación de `specs/02-server.md` (idempotencia, rendimiento, persistencia Docker, sin-precio nunca inventado) y marcar el change listo para archivar
