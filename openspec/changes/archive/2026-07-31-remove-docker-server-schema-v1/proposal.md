## Why

La migración a snapshots Git ya está cerrada y archivada, pero el árbol activo todavía conserva eliminaciones pendientes y especificaciones principales que describen Docker, `apps/server` y el contrato de snapshots v1. Este cambio independiente completa únicamente esa limpieza y deja como estado vigente el dashboard local sobre snapshots v2, sin alterar su comportamiento visible.

## What Changes

- **BREAKING** Eliminar las implementaciones activas versionadas de Docker, `apps/server`, su API, autenticación, migraciones y almacenamiento SQLite propio de TokenViewer; conservar el acceso SQLite read-only de adaptadores de terceros.
- **BREAKING** Eliminar todo soporte activo del snapshot schema v1: conversión, compatibilidad, herramientas, fixtures y tests específicos; mantener exclusivamente el contrato y los datos schema v2.
- **BREAKING** Eliminar el versionado del contrato interno `collector-state.json`: el estado nuevo no contiene `schemaVersion`, su validador es cerrado y cualquier estado local anterior que todavía declare la versión 1 se trata como inválido mediante el warning existente y provoca un escaneo completo, sin conversión, compatibilidad, borrado ni tooling de migración.
- Retirar referencias de workspace, scripts, dependencias, lockfile, configuración y documentación activa que pertenezcan a Docker, servidor o migración v1.
- Mantener sin cambios visibles el dashboard local actual y su carga directa de snapshots v2.
- Reconciliar las especificaciones principales no sincronizadas mediante deltas de este cambio, sin modificar el cambio archivado ni ningún registro histórico.
- Usar únicamente las validaciones existentes: tests, typecheck, build e inspección del árbol versionado; no añadir un guard CI nuevo.
- No eliminar imágenes, bases de datos ni otros artefactos locales no versionados.

## Capabilities

### New Capabilities

- `snapshot-data-contract`: Establece el contrato activo exclusivo de snapshots v2 diarios, cerrados y validados.
- `local-snapshot-dashboard`: Establece la carga y consulta local de snapshots v2 conservando las vistas y filtros actuales sin backend.

### Modified Capabilities

- `usage-adapters`: Elimina terminología de versión inicial y dependencias conceptuales de deduplicación en servidor, conservando los adaptadores y SQLite read-only de terceros.
- `collector-cli`: Sustituye configuración y transporte de servidor por generación, validación y publicación local de snapshots.
- `incremental-scanning`: Confirma snapshots escritos y publicados como destino, sin envío a servidor.
- `usage-ingestion`: Retira la ingesta HTTP y la persistencia de registros individuales en favor del procesamiento local efímero.
- `machine-registry`: Retira registro y tokens de servidor y conserva las identidades fijas de snapshots.
- `pricing-engine`: Mantiene pricing local previo a la agregación y retira caché y repricing del servidor.
- `copilot-auth`: Conserva autenticación local de Copilot sin ninguna relación con un servidor de TokenViewer.
- `copilot-quota-collection`: Persiste únicamente muestras sanitizadas en snapshots locales y retira el transporte al servidor.
- `quota-snapshots`: Sustituye tabla, payload original y endpoints por histórico sanitizado dentro de snapshots v2.
- `quota-dashboard`: Mantiene las cards actuales sobre muestras locales por máquina y proveedor, sin login de cuenta.
- `stats-api`: Sustituye contratos HTTP/SQL por consultas locales sobre agregados diarios y elimina healthcheck y registros individuales.
- `global-filters`: Deriva opciones y resultados de snapshots locales sin peticiones API ni controles horarios.
- `docker-deployment`: Elimina todos los requisitos de imagen, compose, servidor estático y persistencia en contenedor.
- `dashboard-shell`: Mantiene la SPA local y elimina hosting desde servidor, polling de red y autenticación Bearer.
- `summary-cards`: Conserva las cards actuales alimentadas por consultas locales.
- `daily-usage-charts`: Conserva la gráfica diaria actual alimentada por consultas locales.
- `hourly-heatmap`: Retira los requisitos del heatmap 7×24; el calendar heatmap diario permanece en `local-snapshot-dashboard`.
- `models-breakdown`: Conserva la tabla actual alimentada por consultas locales.

## Impact

- Afecta a rutas versionadas de `apps/server`, `docker`, configuración raíz, scripts y dependencias del workspace, herramientas de migración, contrato y tests de snapshots, contrato y tests del estado interno del collector, CI existente, documentación activa y specs principales.
- No afecta a `openspec/changes/archive/**`, historial Git, snapshots v2, imágenes o bases locales, artefactos ignorados, jobs operativos ni diseño/funcionalidad visible del dashboard.
- La aceptación observable exige exit 0 en tests, typecheck y build existentes, dashboard v2 sin cambios visibles, estado nuevo del collector sin campo de versión y ninguna implementación activa versionada de Docker, `apps/server`, snapshot schema v1 o contrato interno `schemaVersion = 1` fuera de historia.
