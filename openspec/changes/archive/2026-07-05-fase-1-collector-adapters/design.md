## Context

TokenViewer agrega el uso de tokens de varios agentes de IA en varios PCs (macOS/Linux). La fase 1 (ver `specs/00-overview.md` y `specs/01-collector.md`) construye la capa de extracción local: monorepo pnpm, tipos compartidos, adaptadores portados de `references/devrage/src/adapters/` y un collector CLI que funciona sin servidor (`run --dry-run`). Restricciones clave: solo lectura sobre los datos de los agentes, escaneo incremental, y preparar (sin implementar) la interfaz de envío al servidor de la fase 2.

## Goals / Non-Goals

**Goals:**

- Monorepo TypeScript funcional con `packages/core`, `packages/adapters` y `apps/collector`.
- 7 adaptadores con tokens reales: `claude`, `codex`, `cursor`, `opencode`, `amp`, `pi`, `t3code`, cada uno con `detect()` y `usage()`.
- Escaneo incremental con estado de cursores persistente y `--full` para backfill.
- `tokenviewer-collector run --dry-run` imprime/exporta un resumen JSON verificable sin servidor.
- Interfaz `IngestClient` y esquemas zod del payload de ingest definidos en `core`.

**Non-Goals:**

- Implementación del envío HTTP al servidor, `init` interactivo, `watch` e `install-service` (fase 2).
- Adaptadores `cline` y `zed` (no exponen tokens en devrage) y Copilot (fase 4).
- Cálculo de costes con catálogo de precios (lo hace el servidor en fase 2); solo se propaga `billedCost` cuando el agente lo expone (opencode).
- Soporte Windows (las rutas quedan parametrizadas, sin testear).

## Decisions

### D1 — Interfaz `Adapter` con `detect()` explícito

```ts
interface Adapter {
  name: string;                                   // "claude", "codex", ...
  detect(): Promise<boolean>;                     // ¿está el agente instalado?
  usage(options?: UsageOptions): AsyncGenerator<UsageRecord>;
}

interface UsageOptions {
  since?: Date;                                   // filtro temporal (SQLite / --full parcial)
  cursors?: FileCursorMap;                        // estado incremental por archivo
  onFileComplete?: (file: string, cursor: FileCursor) => void;
}
```

- Se parte de la interfaz de devrage (`usage?()` opcional, `AdapterOptions.since`) pero `usage()` pasa a ser obligatoria: en fase 1 solo se portan adaptadores con tokens, así el registro de adaptadores no necesita comprobaciones.
- `detect()` se separa de `usage()` (devrage lo infiere de que el generador no produzca nada) para que `status` pueda listar agentes instalados sin parsear logs. Implementación: existencia del directorio/fichero raíz del agente (p. ej. `~/.claude/projects`, `~/.codex/sessions`).
- Los cursores entran por opciones y salen por callback en lugar de que el adaptador toque disco: los adaptadores quedan puros respecto al estado y testables con fixtures.
- Alternativa descartada: interfaz idéntica a devrage sin `detect()` — obligaría al CLI a hacer heurísticas por adaptador y duplicaría conocimiento de rutas.

### D2 — `UsageRecord` extendido en `packages/core`

Se copia el `UsageRecord` de devrage y se añaden los campos que necesitan las fases 1–2:

- `sourceFile: string` — ruta absoluta del log de origen; clave del cursor incremental.
- `recordHash: string` — SHA-256 (hex truncado) de campos estables (`agent`, `sourceFile`, id nativo del registro o `timestamp+session+tokens` si no hay id); base de la dedup idempotente del servidor (spec 02).
- `project?: string` — extraído cuando la ruta lo codifica (Claude Code codifica el proyecto en el nombre del directorio bajo `~/.claude/projects/`).
- `machine` NO se añade al record: lo aporta el collector en el sobre del batch de ingest, no cada adaptador.

Los esquemas zod (record + payload de `POST /api/v1/ingest`) viven en `packages/core` para que fase 2 los reutilice en el servidor sin duplicación.

### D3 — SQLite read-only multi-driver

Se porta `references/devrage/src/adapters/sqlite.ts` casi tal cual:

- Orden de drivers: `node:sqlite` (`DatabaseSync` con `readOnly: true`) → `better-sqlite3` como fallback de compatibilidad; variable `TOKENVIEWER_SQLITE_DRIVER` para forzar uno.
- Apertura siempre read-only; si la apertura falla porque la app viva bloquea el fichero (Cursor con `state.vscdb`, t3code), se copia el fichero (y sus `-wal`/`-shm` si existen) a un tmp del sistema, se lee la copia y se borra.
- `better-sqlite3` se declara `optionalDependency`: en Node ≥ 22 `node:sqlite` basta y se evita compilar nativo.
- Alternativa descartada: solo `better-sqlite3` — dependencia nativa obligatoria y peor instalación; solo `node:sqlite` — rompería en runtimes sin el módulo.

### D4 — Formato del estado de cursores

Fichero único `collector-state.json` en el directorio de estado (`~/.local/state/tokenviewer/` en Linux/XDG, `~/Library/Application Support/tokenviewer/` en macOS), tal como fija `specs/01-collector.md`:

```jsonc
{
  "schemaVersion": 1,
  "files": {
    "<ruta absoluta>": { "size": 12345, "mtimeMs": 1712345678901, "lastByteOffset": 12345 }
  },
  "lastRunAt": "2026-07-05T10:00:00Z"
}
```

- JSONL/JSON: si `size` creció y `mtimeMs` cambió → parsear desde `lastByteOffset`; si `size` menguó (rotación/truncado) → re-parsear entero desde 0; si no cambió nada → saltar el archivo.
- SQLite: sin offset fiable → el cursor del fichero guarda solo `size/mtimeMs` para poder saltarlo si no cambió; cuando cambió, se consulta con `timestamp > lastRunAt - 24h` y la dedup por `recordHash` del servidor absorbe el solape.
- Escritura atómica (tmp + rename) para no corromper el estado si el proceso muere. En fase 1 (`--dry-run`) los cursores se calculan pero solo se persisten cuando el "envío" (impresión/export) concluye, replicando la semántica de fase 2 de "el cursor solo avanza con 2xx".
- Alternativa descartada: un fichero de estado por adaptador — más ficheros sin beneficio; el mapa por ruta absoluta ya aísla adaptadores.

### D5 — Estructura del monorepo y toolchain

```
tokenViewer/
├── package.json               # scripts raíz
├── pnpm-workspace.yaml        # packages/*, apps/*
├── tsconfig.base.json
├── packages/
│   ├── core/                  # tipos, zod, hash, rutas XDG — sin deps de runtime pesadas
│   └── adapters/              # depende de core; un módulo por agente + sqlite.ts + registry
└── apps/
    └── collector/             # depende de core y adapters; bin tokenviewer-collector
```

- pnpm workspaces + TypeScript estricto; ESM en todos los paquetes; `vitest` para tests con fixtures de logs sintéticos por adaptador; `tsx` para ejecutar en desarrollo.
- CLI con parsing de argumentos ligero (`node:util parseArgs` o `commander`); binario declarado en `apps/collector/package.json` (`bin: { "tokenviewer-collector": ... }`).
- `IngestClient` se define como interfaz en `core` con una implementación `DryRunIngestClient` en el collector (agrega y resume); la implementación HTTP llega en fase 2 sin tocar el CLI.

## Risks / Trade-offs

- [Los formatos de log de los agentes cambian con sus updates] → adaptadores tolerantes: líneas/filas no reconocidas se ignoran contándose como `skipped` en el resumen; fixtures congeladas en tests detectan regresiones del parser, no del agente.
- [SQLite bloqueado o WAL inconsistente mientras la app está abierta] → copia a tmp antes de leer; si aún falla, el adaptador registra warning y continúa con el resto (nunca aborta el run completo).
- [Offset por bytes en JSONL con última línea parcial (el agente aún escribe)] → al leer desde `lastByteOffset`, la última línea sin `\n` final no se consume y el offset se fija al final de la última línea completa.
- [Ventana de 24h en SQLite genera registros repetidos entre runs] → aceptado por diseño: `recordHash` estable hace la dedup trivial en servidor; en `--dry-run` el resumen dedup-lica en memoria por hash.
- [`node:sqlite` varía entre versiones de Node] → fallback a `better-sqlite3` y test de humo del driver en CI; requisito documentado Node ≥ 20.
- [Rutas de macOS vs Linux divergen (Cursor, estado del collector)] → módulo único de rutas en `core` con override por variables de entorno (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `XDG_*`), testeable sin tocar el home real.

## Migration Plan

No hay migración: es la primera fase sobre un repo sin código. Rollback = descartar los paquetes nuevos; `specs/` y `references/` no se tocan. La fase 2 extiende (no rompe) `IngestClient` y los esquemas zod.

## Open Questions

- ¿Umbral mínimo de Node (20 vs 22) según la estabilidad de `node:sqlite`? Se decidirá al fijar el toolchain (tarea 1).
- ¿`commander` o `parseArgs` nativo para el CLI? Preferencia por `parseArgs` salvo que `init` interactivo de fase 2 justifique algo mayor.
