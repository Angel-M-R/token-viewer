## Why

GitHub Copilot no escribe contadores de tokens en logs locales accesibles, así que no encaja en el pipeline de adaptadores de las fases 1–3: la única fuente fiable es la API cloud de GitHub (`GET https://api.github.com/copilot_internal/user`), que devuelve **cuota** (porcentaje usado de premium requests, plan, fecha de reset), no tokens. Esta fase, definida en `specs/04-copilot.md`, incorpora Copilot al sistema modelándolo como *snapshots de cuota* y deja el esquema preparado para otros proveedores "de ventana de cuota" en el futuro.

## What Changes

- Nuevo comando `tokenviewer-collector copilot login`: device-flow OAuth de GitHub (mismo client-id que la extensión oficial de VS Code, patrón de `references/CodexBar` `Providers/Copilot`), que guarda el token de GitHub en el config del colector con permisos `0600`.
- El `run` del colector, si hay token de Copilot configurado, hace una llamada a `GET https://api.github.com/copilot_internal/user` por ejecución y produce un snapshot de cuota (`percent_used`, `plan`, `resets_at`, respuesta cruda con el login de GitHub) que envía al servidor.
- Nueva tabla `quota_snapshots` en el servidor (`machine_id`, `provider`, `taken_at`, `percent_used`, `plan`, `resets_at`, `raw`), con `provider` textual para que el mismo esquema sirva a futuros proveedores de cuota (p. ej. límites 5h/semanales de Claude vía OAuth local).
- Nuevo endpoint `POST /api/v1/ingest-quota` con la misma autenticación Bearer por máquina que `/api/v1/ingest`, y dedup blando: se descarta el snapshot si el último de esa máquina/provider tiene menos de 5 minutos.
- Endpoint de lectura de snapshots para el dashboard (último snapshot y serie temporal en el periodo filtrado, deduplicados por cuenta de GitHub, no por máquina).
- Nueva card de Copilot en el resumen del dashboard: gauge de % usado, días hasta el reset y sparkline de la evolución del porcentaje en el periodo filtrado. Como la cuota es por cuenta de GitHub y no por máquina, la visualización deduplica por cuenta (login expuesto desde `raw`).

## Capabilities

### New Capabilities

- `copilot-auth`: autenticación del colector con GitHub mediante device-flow OAuth (`copilot login`), almacenamiento del token en el config con permisos `0600` y estado/limpieza de la sesión.
- `copilot-quota-collection`: obtención del snapshot de cuota en cada `run` del colector vía `copilot_internal/user` (mapeo de porcentaje, plan, reset y login de la cuenta) y envío al servidor, tolerante a fallos de red/token.
- `quota-snapshots`: tabla `quota_snapshots` extensible por proveedor, endpoint `POST /api/v1/ingest-quota` con auth de máquina y dedup blando < 5 min por máquina/provider, y API de lectura para el dashboard con deduplicación por cuenta.
- `quota-dashboard`: card de Copilot en el resumen del dashboard con gauge de % usado, días hasta reset y sparkline del periodo filtrado, deduplicada por cuenta de GitHub.

### Modified Capabilities

<!-- Ninguna: las capacidades existentes (ingesta de UsageRecord, stats, dashboard base) no cambian de requisitos; esta fase solo añade superficies nuevas. -->

## Impact

- Código nuevo: en `apps/collector` el subcomando `copilot login` y el cliente de `copilot_internal/user`; en `apps/server` la tabla `quota_snapshots` (migración Drizzle), el endpoint `POST /api/v1/ingest-quota` y el endpoint de lectura; en `apps/web` la card de Copilot (gauge + sparkline con ECharts).
- Código modificado: `apps/collector` (el `run` añade el paso de snapshot de cuota tras los adaptadores de logs); `packages/core` amplía los esquemas zod compartidos (`QuotaSnapshot`, request/response de ingest-quota y de lectura).
- Dependencias: ninguna nueva significativa (device-flow y API de GitHub con `fetch` nativo; gauge/sparkline con ECharts ya presente).
- Sistemas externos: `https://github.com/login/device/code` y `https://github.com/login/oauth/access_token` (device-flow), `https://api.github.com/copilot_internal/user` (cuota). API interna no versionada públicamente: se guarda la respuesta cruda en `raw` por si cambia el formato.
- Seguridad: el token OAuth de GitHub vive solo en el config local del colector con permisos `0600`; el servidor nunca recibe el token, solo snapshots.
- No se tocan `references/` ni `specs/`.
