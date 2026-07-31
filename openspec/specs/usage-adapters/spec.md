## Purpose

Especifica la capacidad `usage-adapters` aceptada por la fase 1 del collector local de TokenViewer.

## Requirements

### Requirement: Interfaz común de adaptador
Cada adaptador SHALL implementar la interfaz `Adapter` de `packages/core`: `name: string`, `detect(): Promise<boolean>` y `usage(options?: UsageOptions): AsyncGenerator<UsageRecord>`. `detect()` MUST resolver `true` solo si la fuente local del agente existe en la máquina, sin parsear logs.

#### Scenario: Agente instalado
- **WHEN** existe el directorio/fichero de datos del agente (p. ej. `~/.claude/projects` para claude)
- **THEN** `detect()` resuelve `true` y `usage()` produce los `UsageRecord` de sus logs

#### Scenario: Agente no instalado
- **WHEN** la fuente local del agente no existe en la máquina
- **THEN** `detect()` resuelve `false` y `usage()` termina sin producir registros ni lanzar error

### Requirement: Cobertura de agentes de la fase 1
El paquete `packages/adapters` SHALL incluir exactamente los 7 adaptadores con datos de tokens portados de `references/devrage/src/adapters/`: `claude`, `codex`, `cursor`, `opencode`, `amp`, `pi` y `t3code`. Los adaptadores `cline` y `zed` MUST quedar excluidos porque sus fuentes solo exponen mensajes, no tokens. El registro de adaptadores SHALL exponer `createAdapter(name)` y `allAdapters()`.

#### Scenario: Registro completo
- **WHEN** se invoca `allAdapters()`
- **THEN** devuelve instancias para claude, codex, cursor, opencode, amp, pi y t3code, y ninguna para cline ni zed

#### Scenario: Adaptador desconocido
- **WHEN** se invoca `createAdapter("zed")` o cualquier nombre no registrado
- **THEN** se lanza un error que enumera los adaptadores disponibles

### Requirement: Normalización a UsageRecord
Cada adaptador SHALL normalizar cada request o entrada de uso a un `UsageRecord` con dimensiones, timestamp, contadores de tokens, coste facturado cuando exista y metadatos locales necesarios para deduplicar y agregar durante la ejecución. Los campos privados como sesión, proyecto, ruta de origen y hash MUST permanecer efímeros y MUST NOT serializarse en snapshots.

#### Scenario: Registro completo desde JSONL de Claude
- **WHEN** el adaptador claude parsea una entrada válida con usage
- **THEN** emite un `UsageRecord` suficiente para deduplicación, pricing y agregación local

#### Scenario: Campos privados no publicados
- **WHEN** el collector agrega registros normalizados
- **THEN** ningún metadato privado del registro aparece en el snapshot resultante

### Requirement: Fuentes y formatos por agente
Cada adaptador SHALL leer las fuentes locales definidas en `specs/01-collector.md`: claude desde `~/.claude/projects/**/*.jsonl` (respetando `$CLAUDE_CONFIG_DIR`) con dedup por `message.id + requestId` tomando el último valor del usage acumulativo de streaming; codex desde `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` (respetando `$CODEX_HOME` e incluyendo `archived_sessions`) usando eventos `token_count` y el modelo de `turn_context`; cursor desde `state.vscdb` (Application Support en macOS, XDG en Linux) combinando claves `bubbleId:*` y `composerData:*`; opencode desde `opencode.db` propagando `billedCost` real; amp desde `~/.local/share/amp/threads/*.json` vía `usageLedger`; pi desde `~/.pi/agent/sessions/**/*.jsonl`; t3code desde `~/.t3/**/state.sqlite` con eventos `context-window.updated`.

#### Scenario: Usage acumulativo de streaming en claude
- **WHEN** varias líneas comparten `message.id + requestId` con usage acumulativo creciente
- **THEN** el adaptador emite un único `UsageRecord` con los valores finales, sin duplicar tokens

#### Scenario: Coste facturado de opencode
- **WHEN** el adaptador opencode lee una fila con coste real en `opencode.db`
- **THEN** el `UsageRecord` incluye `billedCost` con ese valor

#### Scenario: Override de rutas por entorno
- **WHEN** `$CLAUDE_CONFIG_DIR` o `$CODEX_HOME` están definidos
- **THEN** los adaptadores claude/codex escanean esas rutas en lugar de las de por defecto

### Requirement: Acceso SQLite de solo lectura multi-driver
Los adaptadores basados en SQLite (cursor, opencode, t3code) SHALL abrir las bases de datos siempre en modo read-only mediante un helper multi-driver portado de `references/devrage/src/adapters/sqlite.ts`: `node:sqlite` como driver preferente y `better-sqlite3` como fallback. Si el fichero está bloqueado por la aplicación viva, el helper MUST copiarlo (con sus `-wal`/`-shm` si existen) a un directorio temporal, leer la copia y eliminarla. Si ningún driver funciona, el adaptador MUST omitir esa fuente con un aviso, sin abortar el escaneo de los demás agentes.

#### Scenario: Base de datos bloqueada por la app viva
- **WHEN** `state.vscdb` de Cursor está bloqueado porque Cursor está abierto
- **THEN** el helper copia el fichero a tmp, lee la copia read-only y la elimina al terminar

#### Scenario: Ningún driver disponible
- **WHEN** ni `node:sqlite` ni `better-sqlite3` pueden abrir la base de datos
- **THEN** el adaptador emite un aviso, no produce registros de esa fuente y el resto de adaptadores continúa

### Requirement: Solo lectura sobre los datos de los agentes
Los adaptadores y el collector MUST NOT escribir, crear ni borrar ficheros dentro de los directorios de datos de los agentes. Cualquier fichero temporal SHALL crearse fuera de esos directorios (tmp del sistema o directorio de estado del collector).

#### Scenario: Escaneo completo sin escrituras
- **WHEN** se ejecuta un escaneo completo sobre todos los agentes detectados
- **THEN** ningún fichero bajo los directorios de los agentes (p. ej. `~/.claude`, `~/.codex`, `~/.local/share/opencode`) se crea, modifica ni borra

### Requirement: Tolerancia a entradas malformadas
Los adaptadores SHALL ignorar líneas JSONL malformadas, filas SQLite con esquema inesperado y ficheros ilegibles, contabilizándolos como omitidos, y MUST continuar procesando el resto de la fuente.

#### Scenario: Línea JSONL corrupta
- **WHEN** un `.jsonl` contiene una línea que no es JSON válido entre líneas válidas
- **THEN** esa línea se omite y los registros de las demás líneas se emiten igualmente
