# Spec 01 — Collector (`apps/collector` + `packages/adapters`)

## Objetivo

CLI Node (macOS/Linux) que escanea los logs locales de los agentes de IA instalados en la máquina, normaliza cada request a un `UsageRecord` y lo envía por lotes al servidor central. Debe ser **idempotente** (reenviar no duplica), **incremental** (no re-parsear archivos ya procesados) y **de solo lectura** sobre los datos de los agentes.

## Adaptadores (`packages/adapters`)

Se portan de `references/devrage/src/adapters/` manteniendo su interfaz:

```ts
interface Adapter {
  name: string;                                  // "claude", "codex", ...
  usage(options?: UsageOptions): AsyncGenerator<UsageRecord>;
  detect(): Promise<boolean>;                    // ¿está el agente instalado?
}
```

| Agente | Fuente local | Formato |
|---|---|---|
| claude | `~/.claude/projects/**/*.jsonl` (+ `$CLAUDE_CONFIG_DIR`) | JSONL, líneas `type:"assistant"` con `message.usage`; dedup por `message.id + requestId` (el usage de streaming es acumulativo) |
| codex | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` (+ `$CODEX_HOME`, `archived_sessions`) | JSONL, `event_msg`/`token_count`, modelo desde `turn_context` |
| cursor | `~/Library/Application Support/Cursor/.../state.vscdb` y XDG en Linux | SQLite, claves `bubbleId:*` (tokenCount) + `composerData:*` (modelo) |
| opencode | `~/.local/share/opencode/opencode.db` | SQLite, único con `billedCost` real |
| amp | `~/.local/share/amp/threads/*.json` | JSON con `usageLedger` |
| pi | `~/.pi/agent/sessions/**/*.jsonl` | JSONL |
| t3code | `~/.t3/**/state.sqlite` | SQLite, eventos `context-window.updated` |
| cline | globalStorage VS Code (`saoudrizwan.claude-dev`, roo) | JSON — solo mensajes en devrage; incluir si expone tokens, si no queda fuera de v1 |
| zed | `~/.local/share/zed` / `~/Library/Application Support/Zed` | JSON + SQLite — igual que cline: solo si expone tokens |

Notas de porte:
- Conservar el acceso SQLite multi-driver de `src/adapters/sqlite.ts` (node:sqlite → better-sqlite3), siempre read-only (copiar a tmp si el archivo está bloqueado por la app viva).
- Cada `UsageRecord` gana dos campos nuevos respecto a devrage: `sourceFile` (para el cursor incremental) y `recordHash` (para dedup en servidor, ver spec 02).
- El campo `project` se extrae cuando la ruta del log lo contenga (Claude Code codifica el proyecto en el directorio).

## Escaneo incremental

Estado en `~/.local/state/tokenviewer/collector-state.json` (XDG; en macOS `~/Library/Application Support/tokenviewer/`):

```jsonc
{
  "schemaVersion": 1,
  "files": {
    "<ruta absoluta>": { "size": 12345, "mtimeMs": 1712345678901, "lastByteOffset": 12345 }
  },
  "lastRunAt": "2026-07-05T10:00:00Z"
}
```

- JSONL: si `size` creció y `mtime` cambió, parsear solo desde `lastByteOffset`. Si `size` menguó (rotación), re-parsear entero.
- SQLite: no hay offset fiable → filtrar por `timestamp > lastRunAt - margen(24h)` y confiar en la dedup del servidor.
- `--full` fuerza re-escaneo completo (backfill histórico inicial).

## Envío al servidor

- `POST {serverUrl}/api/v1/ingest` con `Authorization: Bearer <machineToken>`, lotes de ≤ 1000 registros, gzip.
- Respuesta indica `accepted`/`duplicates`; cualquier 2xx confirma el lote y avanza el cursor. Ante fallo de red, el cursor NO avanza (se reintenta en la próxima ejecución).
- Primer arranque: backfill completo de todo el histórico disponible en los logs.

## Configuración

`~/.config/tokenviewer/config.json` (crear con `tokenviewer-collector init`, interactivo):

```jsonc
{
  "serverUrl": "http://server.local:8484",
  "machineToken": "tv_...",          // emitido por el servidor al registrar la máquina
  "machineName": "macbook-angel",    // por defecto os.hostname()
  "agents": ["claude", "codex", "cursor"],  // vacío/ausente = autodetectar todos
  "intervalMinutes": 15
}
```

## Comandos CLI

| Comando | Función |
|---|---|
| `tokenviewer-collector init` | Configura servidor, registra la máquina y guarda el token |
| `tokenviewer-collector run` | Un escaneo + envío y termina (para cron) |
| `tokenviewer-collector watch` | Bucle con `intervalMinutes` (para systemd/launchd) |
| `tokenviewer-collector run --dry-run` | Escanea y muestra resumen sin enviar (fase 1) |
| `tokenviewer-collector run --full` | Ignora cursores, re-escanea todo |
| `tokenviewer-collector status` | Estado: última ejecución, agentes detectados, pendientes |
| `tokenviewer-collector install-service` | Genera unit de systemd (Linux) o plist de launchd (macOS) para `watch` |

## Criterios de aceptación

- Ejecutar `run` dos veces seguidas no produce duplicados en el servidor.
- Un `run` con 30 días de logs de Claude Code + Codex termina en < 30 s en frío y < 2 s incremental.
- Sin red, `run` falla con exit code ≠ 0 y no pierde datos (siguiente run reenvía).
- El collector nunca escribe en los directorios de los agentes.
