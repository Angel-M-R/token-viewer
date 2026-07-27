## ADDED Requirements

### Requirement: Comando de generación y publicación de snapshots
El binario `tokenviewer-collector` SHALL exponer una operación que genere los snapshots pendientes de la máquina configurada, los valide y, cuando se solicite publicación, ejecute el flujo Git seguro. La operación MUST limitar la identidad publicadora a `angel-mac` o `aon-mac-m5`, MUST rechazar `aon-mac` como identidad operativa y MUST terminar con exit code distinto de 0 si generación, validación, commit o publicación fallan.

#### Scenario: Generación local válida
- **WHEN** se ejecuta la operación para una máquina permitida con fuentes disponibles
- **THEN** se crean o actualizan únicamente sus snapshots permitidos y se informa de días y filas agregadas

#### Scenario: Publicación fallida
- **WHEN** el commit queda creado pero el push agota sus reintentos
- **THEN** el comando termina con exit code distinto de 0 e informa que el commit queda pendiente

#### Scenario: Collector configurado con identidad retirada
- **WHEN** se intenta generar o publicar con `machineName = "aon-mac"`
- **THEN** el comando falla antes de escanear fuentes, escribir snapshots o ejecutar Git

## MODIFIED Requirements

### Requirement: Configuración local del collector
El collector SHALL leer su configuración local respetando las rutas de plataforma existentes y SHALL aceptar `machineName`, limitado a las identidades activas `angel-mac` o `aon-mac-m5`, la ruta del checkout operativo y `agents` (lista de adaptadores; vacía o ausente = autodetectar todos con `detect()`). La configuración operativa MUST rechazar la identidad histórica `aon-mac`, MUST NOT requerir `serverUrl`, `machineToken`, `ADMIN_TOKEN` ni `DASHBOARD_TOKEN`, y MUST NOT persistir credenciales Git.

#### Scenario: Configuración de angel-mac
- **WHEN** el config declara `machineName = "angel-mac"` y un checkout operativo válido
- **THEN** el collector queda limitado a generar `snapshots/angel-mac/` usando las credenciales Git externas existentes

#### Scenario: Configuración inválida
- **WHEN** el config declara `aon-mac`, otra identidad, JSON malformado o tipos erróneos
- **THEN** el comando termina con exit code distinto de 0 y señala el campo problemático antes de escribir datos

### Requirement: Comando run con modo dry-run
`tokenviewer-collector run --dry-run` SHALL escanear los agentes seleccionados, calcular costes localmente y emitir por stdout un resumen de los snapshots que produciría sin escribir ficheros, crear commits, ejecutar Git ni contactar el backend retirado. El resumen MUST incluir días, filas agregadas, solicitudes, categorías de tokens, costes y avisos de registros sin precio, sin registros individuales ni campos prohibidos.

#### Scenario: Previsualización sin efectos
- **WHEN** se ejecuta `run --dry-run` con fuentes de varios días
- **THEN** stdout resume los agregados y ninguna ruta de snapshots ni estado Git cambia

#### Scenario: Salida privada
- **WHEN** el escaneo procesa registros con sesión, proyecto, ruta y hash
- **THEN** el resumen dry-run omite esos campos y cualquier registro individual

### Requirement: Comando status
`tokenviewer-collector status` SHALL mostrar los agentes detectados, identidad configurada, última ejecución, commit pendiente si existe y cobertura de fechas de snapshots de la carpeta propia. El comando MUST funcionar sin backend, Docker ni base de datos propia.

#### Scenario: Estado con días faltantes
- **WHEN** las fuentes disponibles incluyen una fecha sin snapshot
- **THEN** `status` informa la fecha como pendiente de reconstrucción

#### Scenario: Estado con commit pendiente
- **WHEN** una ejecución anterior creó un commit que no llegó a `origin/master`
- **THEN** `status` lo identifica sin imprimir credenciales ni contenido sensible

## REMOVED Requirements

### Requirement: Interfaz de envío al servidor (solo contrato en fase 1)
**Reason**: El backend y los contratos HTTP se retiran; el destino es la carpeta de snapshots validada y Git.
**Migration**: Sustituir `IngestClient`, `serverUrl` y `machineToken` por el generador/publicador local y sus contratos agregados.

#### Scenario: Collector migrado
- **WHEN** se ejecuta el collector después del corte
- **THEN** no importa ni instancia una implementación de ingesta HTTP
