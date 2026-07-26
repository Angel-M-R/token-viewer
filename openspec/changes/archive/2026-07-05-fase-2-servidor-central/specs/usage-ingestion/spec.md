## ADDED Requirements

### Requirement: Ingesta idempotente por record_hash
El servidor SHALL exponer `POST /api/v1/ingest` que acepta `{records: UsageRecord[]}` y persiste cada registro en `usage_records` con dedupe por la restricción `UNIQUE (machine_id, record_hash)` usando `INSERT ... ON CONFLICT DO NOTHING`. La respuesta MUST ser `{accepted, duplicates}`, donde `accepted` es el número de filas realmente insertadas y `duplicates` el resto del lote. El lote MUST procesarse dentro de una única transacción. El `record_hash` lo calcula el colector (`sha256(agent | session | requestId-o-messageId | ts | inputTokens | outputTokens)`) y el servidor MUST tratarlo como opaco.

#### Scenario: Lote nuevo
- **WHEN** un colector autenticado envía un lote de 100 registros que no existen en la base de datos
- **THEN** el servidor inserta 100 filas y responde `{accepted: 100, duplicates: 0}`

#### Scenario: Reenvío del mismo lote no crea duplicados
- **WHEN** un colector reenvía exactamente el mismo lote de 100 registros ya ingeridos (por ejemplo tras un reintento)
- **THEN** el servidor responde `{accepted: 0, duplicates: 100}`
- **THEN** el número de filas de `usage_records` no cambia (cero filas nuevas)

#### Scenario: Lote parcialmente duplicado
- **WHEN** un lote contiene 70 registros nuevos y 30 con `record_hash` ya existente para esa máquina
- **THEN** el servidor inserta exactamente 70 filas y responde `{accepted: 70, duplicates: 30}`

#### Scenario: Mismo record_hash desde otra máquina
- **WHEN** dos máquinas distintas envían registros con el mismo `record_hash`
- **THEN** ambos se aceptan, porque la unicidad es por `(machine_id, record_hash)`

#### Scenario: Lote con body inválido
- **WHEN** el body no valida contra el esquema `{records: UsageRecord[]}` (zod de `packages/core`)
- **THEN** el servidor responde `400` sin insertar ninguna fila

### Requirement: Almacenamiento normalizado en UTC
El servidor SHALL almacenar cada `UsageRecord` en `usage_records` con `ts` en ISO 8601 UTC, los cinco contadores de tokens (`input`, `output`, `reasoning`, `cache_read`, `cache_write` con DEFAULT 0), `agent` obligatorio y `provider`/`model`/`session`/`project` opcionales, respetando el esquema de `specs/02-server.md`.

#### Scenario: Registro persistido íntegro
- **WHEN** se ingiere un registro con todos los campos y contadores de tokens
- **THEN** la fila resultante conserva `ts` en UTC y todos los contadores tal como llegaron, asociados a la `machine_id` del token usado

### Requirement: Envío por lotes desde el colector
El colector SHALL enviar los registros pendientes a `POST {serverUrl}/api/v1/ingest` con `Authorization: Bearer <machineToken>`, en lotes de como máximo 1000 registros, con el body comprimido con gzip (`Content-Encoding: gzip`). El colector MUST avanzar el cursor de un lote solo cuando recibe una respuesta 2xx; ante fallo de red o respuesta no-2xx el cursor MUST NOT avanzar y `run` MUST terminar con exit code distinto de 0. En el primer arranque el colector MUST hacer backfill completo de todo el histórico disponible en los logs.

#### Scenario: Envío troceado en lotes
- **WHEN** un `run` tiene 2500 registros pendientes
- **THEN** el colector realiza 3 peticiones (1000 + 1000 + 500) con gzip y Bearer del `machineToken`, avanzando el cursor tras cada 2xx

#### Scenario: Fallo de red no pierde datos
- **WHEN** el servidor es inalcanzable durante el envío de un lote
- **THEN** el cursor no avanza, `run` termina con exit code ≠ 0 y la siguiente ejecución reenvía desde el último lote confirmado

#### Scenario: Reintento absorbido por el servidor
- **WHEN** un lote se confirmó en el servidor pero la respuesta se perdió y el colector lo reenvía en el siguiente `run`
- **THEN** el servidor responde con `duplicates` igual al tamaño del lote y el estado final es correcto, sin filas duplicadas

### Requirement: Registro de la máquina desde el colector
El comando `tokenviewer-collector init` SHALL registrar la máquina llamando a `POST /api/v1/machines/register` con el `ADMIN_TOKEN` proporcionado interactivamente y SHALL guardar el `machineToken` recibido en `~/.config/tokenviewer/config.json` junto con `serverUrl` y `machineName` (por defecto `os.hostname()`). El `ADMIN_TOKEN` MUST NOT persistirse en la configuración del colector.

#### Scenario: Init configura y registra
- **WHEN** el usuario ejecuta `tokenviewer-collector init` e introduce `serverUrl` y `ADMIN_TOKEN`
- **THEN** la máquina queda registrada en el servidor y el config resultante contiene `serverUrl`, `machineName` y `machineToken`, pero no el `ADMIN_TOKEN`
