## MODIFIED Requirements

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
