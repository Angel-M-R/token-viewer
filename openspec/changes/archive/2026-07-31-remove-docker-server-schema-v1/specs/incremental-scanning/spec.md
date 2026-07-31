## ADDED Requirements

### Requirement: Detección de fechas ausentes
El collector SHALL comparar para su identidad activa las fechas presentes en las fuentes con los snapshots válidos de su carpeta y MUST reconstruir cualquier fecha ausente sin depender únicamente de `lastRunAt`.

#### Scenario: Hueco entre fechas publicadas
- **WHEN** existen snapshots de los días 1 y 3 pero las fuentes contienen actividad del día 2
- **THEN** la siguiente ejecución genera el snapshot v2 del día 2

## MODIFIED Requirements

### Requirement: El cursor solo avanza tras confirmación
Los cursores MUST NOT persistirse hasta que los agregados hayan sido validados y escritos atómicamente. En publicación, el estado MUST identificar un commit pendiente y conservar información suficiente para reintentarlo; un fallo de validación, escritura, commit o push MUST NOT marcar los días como publicados ni perder datos pendientes.

#### Scenario: Fallo antes de confirmar
- **WHEN** el proceso falla después de parsear registros pero antes de confirmar el snapshot
- **THEN** el estado previo permanece intacto y la siguiente ejecución vuelve a procesar lo pendiente

#### Scenario: Push fallido después del commit
- **WHEN** el snapshot queda en un commit local pero el push falla
- **THEN** el estado conserva el commit pendiente para el siguiente intento

### Requirement: Estado interno estricto y no versionado
`collector-state.json` MUST usar un contrato cerrado sin campo `schemaVersion` y MUST aceptar únicamente `files`, `lastRunAt` y `pendingPublicationCommit` con sus tipos vigentes. Un estado que contenga propiedades desconocidas, incluido el anterior `schemaVersion = 1`, MUST seguir el camino existente de estado inválido o desconocido: emitir el warning, usar estado vacío y provocar un escaneo completo. El collector MUST NOT convertir, aceptar por compatibilidad, eliminar ni proporcionar tooling de migración para ese fichero anterior.

#### Scenario: Estado anterior con versión 1
- **WHEN** el collector carga un `collector-state.json` que todavía contiene `schemaVersion = 1`
- **THEN** lo rechaza con el warning ordinario, parte de estado vacío y realiza un escaneo completo sin convertir ni eliminar el fichero durante la carga

#### Scenario: Persistencia del estado nuevo
- **WHEN** el collector confirma cursores o un commit pendiente y persiste el estado
- **THEN** escribe únicamente los campos permitidos por el contrato estricto y no incluye ningún campo de versión
