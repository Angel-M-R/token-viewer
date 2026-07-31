## ADDED Requirements

### Requirement: Procesamiento local efímero
El collector SHALL procesar cada `UsageRecord` únicamente en memoria para deduplicarlo, calcular su coste y agregarlo por día local `Europe/Madrid` antes de escribir un snapshot v2. TokenViewer MUST NOT persistir registros individuales en una base propia, ficheros versionados ni payloads de red.

#### Scenario: Registro normalizado
- **WHEN** un adaptador emite un registro con métricas y campos privados
- **THEN** el collector incorpora solo dimensiones y métricas permitidas al agregado y descarta el registro efímero

## REMOVED Requirements

### Requirement: Ingesta idempotente por record_hash
**Reason**: Se eliminan endpoint, servidor y tabla de registros individuales.
**Migration**: Deduplicar en memoria antes de agregar al snapshot v2.

#### Scenario: Sin endpoint de ingesta
- **WHEN** el collector procesa actividad
- **THEN** no envía ni persiste registros individuales en TokenViewer

### Requirement: Almacenamiento normalizado en UTC
**Reason**: TokenViewer deja de almacenar registros individuales normalizados.
**Migration**: Conservar únicamente su contribución al agregado diario local.

#### Scenario: Persistencia agregada
- **WHEN** se procesa un registro válido
- **THEN** solo puede persistirse su contribución agregada al snapshot v2

### Requirement: Envío por lotes desde el colector
**Reason**: No existe transporte ni servidor de ingesta.
**Migration**: Usar escritura atómica local y publicación Git del snapshot validado.

#### Scenario: Ejecución diaria
- **WHEN** el collector procesa actividad nueva
- **THEN** prepara snapshots locales sin enviar lotes a una URL de TokenViewer

### Requirement: Registro de la máquina desde el colector
**Reason**: Las identidades son fijas y no requieren registro ni tokens de máquina.
**Migration**: Configurar una identidad publicadora y su checkout operativo.

#### Scenario: Configuración inicial
- **WHEN** se prepara una publicadora activa
- **THEN** no se solicita URL, token administrativo ni token de máquina de TokenViewer
