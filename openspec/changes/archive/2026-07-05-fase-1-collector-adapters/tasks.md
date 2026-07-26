## 1. Monorepo y toolchain

- [x] 1.1 Crear `package.json` raíz, `pnpm-workspace.yaml` (`packages/*`, `apps/*`) y `tsconfig.base.json` (ESM, strict); fijar versión mínima de Node según disponibilidad de `node:sqlite`
- [x] 1.2 Crear los esqueletos de `packages/core`, `packages/adapters` y `apps/collector` con sus `package.json`, dependencias de workspace y scripts `build`/`test` (vitest, tsx)
- [x] 1.3 Verificar: `pnpm install && pnpm build` compila los tres paquetes sin errores

## 2. packages/core — tipos y utilidades

- [x] 2.1 Definir `UsageRecord` (campos de devrage + `sourceFile`, `recordHash`, `project?`), `Adapter` (`name`, `detect()`, `usage()`), `UsageOptions` y tipos de cursor (`FileCursor`, `FileCursorMap`)
- [x] 2.2 Implementar `computeRecordHash()` (SHA-256 sobre campos estables) con tests de estabilidad entre ejecuciones
- [x] 2.3 Implementar módulo de rutas de plataforma (config XDG/macOS, state dir, overrides `$CLAUDE_CONFIG_DIR`, `$CODEX_HOME`, `$XDG_*`) con tests
- [x] 2.4 Definir esquemas zod de `UsageRecord` y del payload de `POST /api/v1/ingest` (lote ≤ 1000 + sobre de máquina) y la interfaz `IngestClient` (solo contrato; implementación HTTP en fase 2)

## 3. packages/adapters — porte desde devrage

- [x] 3.1 Portar `sqlite.ts`: apertura read-only multi-driver (`node:sqlite` → `better-sqlite3` como optionalDependency, override `TOKENVIEWER_SQLITE_DRIVER`) con copia a tmp (incluyendo `-wal`/`-shm`) si el fichero está bloqueado
- [x] 3.2 Portar adaptador `claude` (JSONL `~/.claude/projects/**`, dedup `message.id + requestId` con usage acumulativo, extracción de `project` del directorio) + `detect()` + fixtures/tests
- [x] 3.3 Portar adaptador `codex` (JSONL `~/.codex/sessions/` y `archived_sessions`, eventos `token_count`, modelo de `turn_context`) + `detect()` + fixtures/tests
- [x] 3.4 Portar adaptador `cursor` (SQLite `state.vscdb`, claves `bubbleId:*` + `composerData:*`, rutas macOS/XDG) + `detect()` + fixtures/tests
- [x] 3.5 Portar adaptador `opencode` (SQLite `opencode.db`, propagar `billedCost`) + `detect()` + fixtures/tests
- [x] 3.6 Portar adaptador `amp` (JSON `threads/*.json`, `usageLedger`) + `detect()` + fixtures/tests
- [x] 3.7 Portar adaptador `pi` (JSONL `~/.pi/agent/sessions/**`) + `detect()` + fixtures/tests
- [x] 3.8 Portar adaptador `t3code` (SQLite `~/.t3/**/state.sqlite`, eventos `context-window.updated`) + `detect()` + fixtures/tests
- [x] 3.9 Crear el registro (`createAdapter`, `allAdapters`) con exactamente los 7 adaptadores (sin cline/zed) y añadir en todos: emisión de `sourceFile`/`recordHash`, tolerancia a entradas malformadas (contador de omitidos) y test que verifica cero escrituras en los directorios de agentes

## 4. apps/collector — escaneo incremental

- [x] 4.1 Implementar carga/guardado de `collector-state.json` (schemaVersion 1, escritura atómica tmp+rename, descarte con aviso si está corrupto o con versión desconocida)
- [x] 4.2 Implementar la lógica de cursores JSONL: comparación `size`/`mtimeMs`, lectura desde `lastByteOffset`, re-parseo completo si el fichero menguó, offset fijado al final de la última línea completa; tests con fichero que crece, rota y con línea final parcial
- [x] 4.3 Implementar la lógica de cursores SQLite: salto si `size`/`mtimeMs` sin cambios, consulta con `timestamp > lastRunAt - 24h`; test de solape deduplicado por `recordHash`
- [x] 4.4 Implementar `--full` (ignorar cursores, regenerar estado al completar) y la regla "el cursor solo avanza tras confirmación" (estado intacto ante fallo); tests de ambos

## 5. apps/collector — CLI

- [x] 5.1 Montar el binario `tokenviewer-collector` con parsing de argumentos y carga/validación zod de `~/.config/tokenviewer/config.json` (opcional en fase 1; error claro con exit ≠ 0 si es inválido; filtro `agents` o autodetección)
- [x] 5.2 Implementar `run --dry-run`: escaneo de agentes seleccionados, dedup en memoria por `recordHash`, resumen JSON por stdout (por agente: registros, ficheros escaneados/omitidos, tokens, `billedCost`; totales globales y rango `from`/`to`) y `--out <ruta>` para exportar
- [x] 5.3 Implementar `DryRunIngestClient` como implementación de `IngestClient`, y hacer que `run` sin `--dry-run` termine con mensaje "envío no disponible hasta fase 2" y exit ≠ 0 sin tocar cursores
- [x] 5.4 Implementar `status`: agentes detectados vía `detect()`, `lastRunAt` y recuento de ficheros con cursor; funcional sin config ni estado previo
- [x] 5.5 Definir los exit codes de `run` (0 si completa aunque haya fuentes omitidas con aviso; ≠ 0 ante error irrecuperable) con tests

## 6. Verificación de fase

- [x] 6.1 Test E2E con fixtures: dos `run --dry-run` consecutivos — el segundo no re-parsea ficheros confirmados y el total deduplicado no cambia
- [x] 6.2 Medir rendimiento con logs reales o fixtures de ~30 días (claude + codex): < 30 s en frío y < 2 s incremental; documentar el resultado en el change
- [x] 6.3 Ejecutar `run --dry-run` en la máquina de desarrollo y validar manualmente el resumen JSON (agentes detectados, totales plausibles, ninguna escritura en directorios de agentes)
