## Why

TokenViewer necesita, como primer paso verificable, la capa de extracción local: sin adaptadores que lean los logs de los agentes y los normalicen a `UsageRecord`, no hay datos que ingerir en el servidor (fase 2) ni que visualizar (fase 3). Esta fase entrega el monorepo TypeScript y un collector ejecutable en modo local (`run --dry-run`), comprobable sin ningún servidor desplegado.

## What Changes

- Se crea el monorepo con pnpm workspaces: `packages/core`, `packages/adapters` y `apps/collector` (sin `apps/server` ni `apps/web` todavía).
- `packages/core`: tipos compartidos (`UsageRecord` con los campos nuevos `sourceFile` y `recordHash`, `Adapter`, `UsageOptions`) y utilidades comunes (hash de registro, rutas XDG/macOS).
- `packages/adapters`: se portan de `references/devrage/src/adapters/` los 7 adaptadores que exponen tokens — `claude`, `codex`, `cursor`, `opencode`, `amp`, `pi`, `t3code` — añadiendo `detect()` a la interfaz. `cline` y `zed` quedan fuera de v1 porque en devrage solo exponen mensajes, no tokens.
- Se conserva el acceso SQLite read-only multi-driver (`node:sqlite` → `better-sqlite3`, copia a tmp si el fichero está bloqueado).
- `apps/collector`: CLI `tokenviewer-collector` con escaneo incremental por cursores (estado en `collector-state.json`), comandos `run` (con `--dry-run` y `--full`) y `status`, y configuración en `~/.config/tokenviewer/config.json`.
- El envío al servidor (`POST /api/v1/ingest`) se define solo como interfaz (`IngestClient` + esquemas zod del payload en `core`); su implementación real, junto con `init`, `watch` e `install-service`, llega en la fase 2.

## Capabilities

### New Capabilities

- `usage-adapters`: adaptadores de solo lectura que detectan cada agente instalado y normalizan sus logs locales (JSONL/JSON/SQLite) a `UsageRecord`, incluyendo `sourceFile`, `recordHash` y `project`.
- `incremental-scanning`: estado persistente de cursores por archivo (offset de bytes para JSONL, ventana temporal para SQLite) que evita re-parsear lo ya procesado y soporta re-escaneo completo con `--full`.
- `collector-cli`: CLI `tokenviewer-collector` con configuración local, `run --dry-run` (resumen JSON sin servidor), `status`, y la interfaz de envío al servidor definida pero no implementada.

### Modified Capabilities

_Ninguna: no existen specs previas en `openspec/specs/`._

## Impact

- **Código nuevo**: `package.json` raíz + `pnpm-workspace.yaml`, `packages/core/`, `packages/adapters/`, `apps/collector/`.
- **Dependencias**: pnpm, TypeScript, `better-sqlite3` (fallback opcional de `node:sqlite`), zod, tsx/vitest para desarrollo y tests.
- **Sistemas afectados**: lectura (nunca escritura) de los directorios de datos de los agentes (`~/.claude`, `~/.codex`, state.vscdb de Cursor, etc.); escritura solo en el directorio de estado del collector (`~/.local/state/tokenviewer/` o `~/Library/Application Support/tokenviewer/`).
- **Fases posteriores**: la fase 2 consumirá la interfaz `IngestClient` y los esquemas zod definidos aquí; `references/devrage` y `specs/` no se modifican.
