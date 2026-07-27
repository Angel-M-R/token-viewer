## ADDED Requirements

### Requirement: Detección de fechas ausentes
El collector SHALL comparar, únicamente para una identidad activa configurada, las fechas presentes en las fuentes disponibles con los snapshots válidos de su carpeta y MUST reconstruir automáticamente cualquier fecha ausente. La detección MUST ignorar las carpetas de las otras identidades y MUST NOT depender únicamente de `lastRunAt`. La identidad histórica `aon-mac` MUST rechazarse antes de iniciar el escaneo.

#### Scenario: Hueco entre fechas publicadas
- **WHEN** existen snapshots del día 1 y 3 pero las fuentes contienen actividad del día 2
- **THEN** la siguiente ejecución procesa y crea el día 2

#### Scenario: Estado local perdido
- **WHEN** falta o está corrupto `collector-state.json` pero existen snapshots válidos
- **THEN** el collector redescubre fuentes y días sin sumar otra vez sobre los snapshots existentes

#### Scenario: Identidad retirada sin fuente local
- **WHEN** se solicita detectar fechas ausentes para `aon-mac`
- **THEN** el collector rechaza la operación y conserva intactos sus snapshots históricos ya importados

## MODIFIED Requirements

### Requirement: Re-escaneo completo con --full
El flag `--full` SHALL ignorar los cursores guardados, re-escanear todo el histórico disponible de todas las fuentes seleccionadas y reconstruir en memoria los agregados por fecha. Por defecto MUST escribir días ausentes y el día UTC abierto sin modificar días cerrados existentes; una opción explícita de reparación SHALL ser necesaria para reemplazar días cerrados y MUST pasar validación completa.

#### Scenario: Backfill forzado inicial
- **WHEN** se ejecuta `tokenviewer-collector run --full` sin snapshots existentes
- **THEN** todos los ficheros fuente se procesan desde el inicio y se produce un snapshot por fecha disponible

#### Scenario: Día cerrado existente
- **WHEN** `--full` vuelve a encontrar una fecha cerrada que ya tiene snapshot válido sin solicitar reparación
- **THEN** no reemplaza ese fichero

### Requirement: El cursor solo avanza tras confirmación
Los cursores MUST NOT persistirse hasta que los agregados del escaneo hayan sido validados y escritos atómicamente. En modo de publicación, el estado MUST identificar por separado si existe un commit pendiente y MUST conservar información suficiente para reintentarlo; un fallo de validación, escritura, commit o publicación MUST NOT marcar los días como publicados ni perder datos pendientes.

#### Scenario: Fallo antes de escribir el snapshot
- **WHEN** el proceso falla después de parsear registros pero antes de validar y renombrar los ficheros
- **THEN** el estado confirmado previo permanece intacto y la siguiente ejecución vuelve a procesar lo pendiente

#### Scenario: Push fallido después del commit
- **WHEN** el snapshot se escribió y confirmó en un commit pero el push falla
- **THEN** el estado conserva el commit como pendiente y la siguiente ejecución intenta publicarlo antes de generar cambios nuevos
