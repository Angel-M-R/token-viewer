## Purpose

Especifica la capacidad `collector-cli` aceptada por la fase 1 del collector local de TokenViewer.

## Requirements

### Requirement: Binario y estructura del monorepo
El monorepo SHALL usar pnpm workspaces con `packages/core` (tipos `UsageRecord`, `Adapter`, esquemas zod, utilidades de hash y rutas), `packages/adapters` y `apps/collector`. `apps/collector` MUST exponer el binario `tokenviewer-collector` y depender de `core` y `adapters` como paquetes del workspace.

#### Scenario: Instalación del workspace
- **WHEN** se ejecuta `pnpm install` y `pnpm build` en la raíz del repo
- **THEN** los tres paquetes compilan y el binario `tokenviewer-collector` es ejecutable (p. ej. vía `pnpm --filter collector exec tokenviewer-collector --help`)

### Requirement: Configuración local del collector
El collector SHALL leer su configuración de `~/.config/tokenviewer/config.json` (respetando `$XDG_CONFIG_HOME`) con los campos `serverUrl`, `machineToken`, `machineName` (por defecto `os.hostname()`), `agents` (lista de adaptadores; vacía o ausente = autodetectar todos con `detect()`) e `intervalMinutes`. En fase 1 la configuración MUST ser opcional: `run --dry-run` SHALL funcionar sin fichero de configuración usando autodetección y valores por defecto.

#### Scenario: Sin configuración en modo dry-run
- **WHEN** no existe `config.json` y se ejecuta `tokenviewer-collector run --dry-run`
- **THEN** el collector autodetecta los agentes instalados y completa el escaneo sin error

#### Scenario: Filtro de agentes configurado
- **WHEN** `config.json` contiene `"agents": ["claude", "codex"]`
- **THEN** solo se escanean los adaptadores claude y codex aunque haya más agentes instalados

#### Scenario: Configuración inválida
- **WHEN** `config.json` existe pero no valida contra el esquema (JSON malformado o tipos erróneos)
- **THEN** el comando termina con exit code distinto de 0 y un mensaje que indica el campo problemático

### Requirement: Comando run con modo dry-run
`tokenviewer-collector run --dry-run` SHALL escanear los agentes seleccionados y emitir por stdout un resumen JSON sin contactar ningún servidor. El resumen MUST incluir, como mínimo: por agente, número de registros, ficheros escaneados/omitidos y totales de tokens (`inputTokens`, `outputTokens`, `reasoningTokens`, `cacheReadTokens`, `cacheWriteTokens`) y `billedCost` agregado cuando exista; más totales globales y rango temporal (`from`/`to`). Con `--out <ruta>` el resumen (y opcionalmente los registros completos) SHALL exportarse a un fichero JSON. En dry-run el collector MUST deduplicar en memoria por `recordHash` antes de agregar.

#### Scenario: Resumen por stdout
- **WHEN** se ejecuta `run --dry-run` en una máquina con logs de claude y codex
- **THEN** stdout contiene un JSON con una entrada por agente (registros, tokens, ficheros) y totales globales, y no se realiza ninguna petición de red

#### Scenario: Export a fichero
- **WHEN** se ejecuta `run --dry-run --out /tmp/resumen.json`
- **THEN** se escribe un JSON válido en esa ruta con el mismo contenido del resumen

#### Scenario: Exit code según resultado
- **WHEN** el escaneo dry-run completa (aunque algún adaptador haya omitido su fuente con aviso)
- **THEN** el proceso termina con exit code 0; si el escaneo aborta por error irrecuperable, termina con exit code distinto de 0

### Requirement: Comando status
`tokenviewer-collector status` SHALL mostrar el estado local: agentes detectados (resultado de `detect()` por adaptador), fecha de la última ejecución (`lastRunAt` del estado) y número de ficheros con cursor. El comando MUST funcionar sin servidor y sin configuración.

#### Scenario: Estado tras un escaneo
- **WHEN** se ejecuta `status` después de un `run --dry-run` exitoso
- **THEN** se listan los agentes detectados, el `lastRunAt` del último escaneo y el recuento de ficheros rastreados

#### Scenario: Estado sin escaneos previos
- **WHEN** se ejecuta `status` sin que exista `collector-state.json`
- **THEN** se listan los agentes detectados y se indica que aún no hay ejecuciones registradas

### Requirement: Interfaz de envío al servidor (solo contrato en fase 1)
`packages/core` SHALL definir la interfaz `IngestClient` y los esquemas zod del payload de `POST /api/v1/ingest` (lotes de ≤ 1000 `UsageRecord` con sobre de máquina: `machineName`, autenticación Bearer `machineToken`). En fase 1 el collector MUST incluir únicamente una implementación dry-run (agregar y resumir); la implementación HTTP real, junto con los comandos `init`, `watch` e `install-service`, queda diferida a la fase 2. `run` sin `--dry-run` MUST terminar con un mensaje claro de "envío no disponible hasta fase 2" y exit code distinto de 0.

#### Scenario: Contrato disponible para fase 2
- **WHEN** un consumidor importa `packages/core`
- **THEN** obtiene la interfaz `IngestClient` y los esquemas zod del payload de ingest validables sin servidor

#### Scenario: Envío real no implementado
- **WHEN** se ejecuta `tokenviewer-collector run` sin `--dry-run` en fase 1
- **THEN** el proceso informa de que el envío llega en fase 2 y termina con exit code distinto de 0 sin tocar los cursores
