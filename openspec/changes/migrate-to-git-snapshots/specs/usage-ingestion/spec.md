## ADDED Requirements

### Requirement: Procesamiento local efímero
El collector SHALL procesar cada `UsageRecord` únicamente en memoria para deduplicarlo, calcular su coste y agregarlo por fecha y hora antes de escribir el contrato de snapshot. TokenViewer MUST NOT persistir el registro individual en SQLite, ficheros versionados ni payloads de red.

#### Scenario: Registro normalizado
- **WHEN** un adaptador emite un registro con tokens, dimensiones y campos privados
- **THEN** el collector incorpora solo métricas y dimensiones permitidas al agregado y descarta el registro al finalizar la ejecución

#### Scenario: Registro duplicado
- **WHEN** dos fuentes o reescaneos emiten el mismo `recordHash` durante una ejecución
- **THEN** el agregado cuenta el registro una sola vez y el hash no se serializa

## REMOVED Requirements

### Requirement: Ingesta idempotente por record_hash
**Reason**: Se eliminan endpoint, servidor y tabla de registros individuales; la deduplicación ocurre en memoria antes de agregar.
**Migration**: Usar el generador de snapshots y la clave agregada del contrato, sin versionar `recordHash`.

#### Scenario: Endpoint retirado
- **WHEN** finaliza el corte
- **THEN** `POST /api/v1/ingest` deja de existir y ningún registro se persiste en `usage_records`

### Requirement: Almacenamiento normalizado en UTC
**Reason**: TokenViewer deja de almacenar registros individuales normalizados.
**Migration**: Conservar UTC y los cinco contadores solo en las filas horarias agregadas del snapshot.

#### Scenario: Persistencia agregada
- **WHEN** se procesa un registro después de la migración
- **THEN** solo su contribución agregada UTC puede persistirse

### Requirement: Envío por lotes desde el colector
**Reason**: No existe servidor de ingesta ni transporte de registros.
**Migration**: Sustituir lotes gzip y Bearer por escritura atómica local y publicación Git del snapshot validado.

#### Scenario: Ejecución diaria migrada
- **WHEN** el collector procesa actividad nueva
- **THEN** no envía registros a una URL y prepara el snapshot local

### Requirement: Registro de la máquina desde el colector
**Reason**: Las tres identidades son fijas y no necesitan registro ni tokens de máquina; solo `angel-mac` y `aon-mac-m5` son publicadoras activas.
**Migration**: Configurar explícitamente `angel-mac` o `aon-mac-m5` y su checkout operativo; conservar `aon-mac` únicamente como histórico de snapshots.

#### Scenario: Configuración inicial migrada
- **WHEN** se prepara una de las dos publicadoras activas
- **THEN** no se solicita `ADMIN_TOKEN`, `serverUrl` ni `machineToken`
