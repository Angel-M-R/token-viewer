## Purpose

Especifica la capacidad `incremental-scanning` aceptada por la fase 1 del collector local de TokenViewer.

## Requirements

### Requirement: Estado persistente de cursores
El collector SHALL persistir el estado de escaneo en `collector-state.json` dentro del directorio de estado de la plataforma: `~/.local/state/tokenviewer/` en Linux (respetando `$XDG_STATE_HOME`) y `~/Library/Application Support/tokenviewer/` en macOS. El fichero MUST usar el contrato estricto vigente de cursores, última ejecución y commit pendiente, sin campo de versión, y su escritura MUST ser atómica (escribir a fichero temporal y renombrar).

#### Scenario: Primer escaneo crea el estado
- **WHEN** se ejecuta un escaneo y no existe `collector-state.json`
- **THEN** se procesa todo el histórico disponible y al terminar se crea el fichero con una entrada por archivo procesado y `lastRunAt` actualizado

#### Scenario: Escritura atómica
- **WHEN** el proceso muere mientras persiste el estado
- **THEN** el `collector-state.json` previo permanece válido (nunca queda un JSON truncado)

#### Scenario: Estado corrupto o con propiedades desconocidas
- **WHEN** `collector-state.json` no es JSON válido o contiene propiedades no permitidas
- **THEN** el collector lo descarta con un aviso y procede como escaneo completo

### Requirement: Escaneo incremental de ficheros JSONL
Para fuentes JSONL/JSON, el collector SHALL comparar `size` y `mtimeMs` actuales con el cursor guardado: si el fichero creció, MUST parsear solo desde `lastByteOffset`; si `size` menguó (rotación o truncado), MUST re-parsear el fichero entero desde el byte 0; si no cambió, MUST omitirlo sin abrirlo. El `lastByteOffset` MUST fijarse al final de la última línea completa, de modo que una línea final parcial (el agente aún escribiendo) no se consuma y se relea en el siguiente escaneo.

#### Scenario: Fichero con líneas nuevas
- **WHEN** un `.jsonl` ya escaneado crece de 12345 a 20000 bytes
- **THEN** solo se parsean los bytes desde el offset 12345 y el cursor avanza a la nueva posición

#### Scenario: Fichero sin cambios
- **WHEN** `size` y `mtimeMs` coinciden con el cursor guardado
- **THEN** el fichero se omite sin leerlo y no se emiten registros de él

#### Scenario: Fichero rotado
- **WHEN** el `size` actual es menor que el `size` del cursor
- **THEN** el fichero se re-parsea entero desde el byte 0

#### Scenario: Última línea incompleta
- **WHEN** el fichero termina en una línea sin salto de línea final
- **THEN** esa línea no se emite y `lastByteOffset` queda al final de la última línea completa

### Requirement: Escaneo incremental de fuentes SQLite
Para fuentes SQLite, donde no existe offset de bytes fiable, el collector SHALL filtrar las consultas por `timestamp > lastRunAt - 24h` (margen de solape) y delegar la eliminación de repetidos en la dedup por `recordHash`. Si `size` y `mtimeMs` del fichero SQLite no han cambiado respecto al cursor, el collector MUST omitir la fuente sin consultarla.

#### Scenario: Consulta con ventana temporal
- **WHEN** existe `lastRunAt` de un escaneo previo y la base de datos ha cambiado
- **THEN** solo se consultan filas con timestamp posterior a `lastRunAt` menos 24 horas

#### Scenario: Solape absorbido por dedup
- **WHEN** dos escaneos consecutivos emiten el mismo registro por el margen de 24h
- **THEN** ambos comparten `recordHash` y la deduplicación (servidor o resumen dry-run) lo cuenta una sola vez

### Requirement: Re-escaneo completo con --full
El flag `--full` SHALL ignorar todos los cursores guardados y re-escanear el histórico completo de todas las fuentes (backfill). Al terminar con éxito, el estado MUST reescribirse con los cursores resultantes.

#### Scenario: Backfill forzado
- **WHEN** se ejecuta `tokenviewer-collector run --full` con cursores existentes
- **THEN** todos los ficheros se procesan desde el inicio y el estado se regenera al completar

### Requirement: El cursor solo avanza tras confirmación
Los cursores MUST NOT persistirse hasta que los agregados hayan sido validados y escritos atómicamente. En publicación, el estado MUST identificar un commit pendiente y conservar información suficiente para reintentarlo; un fallo de validación, escritura, commit o push MUST NOT marcar los días como publicados ni perder datos pendientes.

#### Scenario: Fallo antes de confirmar
- **WHEN** el proceso falla después de parsear registros pero antes de confirmar el snapshot
- **THEN** el estado previo permanece intacto y la siguiente ejecución vuelve a procesar lo pendiente

#### Scenario: Push fallido después del commit
- **WHEN** el snapshot queda en un commit local pero el push falla
- **THEN** el estado conserva el commit pendiente para el siguiente intento

### Requirement: Detección de fechas ausentes
El collector SHALL comparar para su identidad activa las fechas presentes en las fuentes con los snapshots válidos de su carpeta y MUST reconstruir cualquier fecha ausente sin depender únicamente de `lastRunAt`.

#### Scenario: Hueco entre fechas publicadas
- **WHEN** existen snapshots de los días 1 y 3 pero las fuentes contienen actividad del día 2
- **THEN** la siguiente ejecución genera el snapshot v2 del día 2

### Requirement: Estado interno estricto y no versionado
`collector-state.json` MUST usar un contrato cerrado sin campo `schemaVersion` y MUST aceptar únicamente `files`, `lastRunAt` y `pendingPublicationCommit` con sus tipos vigentes. Un estado que contenga propiedades desconocidas, incluido el anterior `schemaVersion = 1`, MUST seguir el camino existente de estado inválido o desconocido: emitir el warning, usar estado vacío y provocar un escaneo completo. El collector MUST NOT convertir, aceptar por compatibilidad, eliminar ni proporcionar tooling de migración para ese fichero anterior.

#### Scenario: Estado anterior con versión 1
- **WHEN** el collector carga un `collector-state.json` que todavía contiene `schemaVersion = 1`
- **THEN** lo rechaza con el warning ordinario, parte de estado vacío y realiza un escaneo completo sin convertir ni eliminar el fichero durante la carga

#### Scenario: Persistencia del estado nuevo
- **WHEN** el collector confirma cursores o un commit pendiente y persiste el estado
- **THEN** escribe únicamente los campos permitidos por el contrato estricto y no incluye ningún campo de versión

### Requirement: Rendimiento del escaneo
Un escaneo con ~30 días de logs de Claude Code y Codex SHALL completarse en menos de 30 segundos en frío (sin estado) y en menos de 2 segundos en modo incremental.

#### Scenario: Escaneo incremental rápido
- **WHEN** se ejecuta `run` inmediatamente después de otro `run` exitoso sobre 30 días de logs
- **THEN** el escaneo incremental termina en menos de 2 segundos
