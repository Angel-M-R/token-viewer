## Purpose

Especifica la capacidad `collector-cli` aceptada por la fase 1 del collector local de TokenViewer.

## Requirements

### Requirement: Binario y estructura del monorepo
El monorepo SHALL usar pnpm workspaces con `packages/core` (tipos `UsageRecord`, `Adapter`, esquemas zod, utilidades de hash y rutas), `packages/adapters` y `apps/collector`. `apps/collector` MUST exponer el binario `tokenviewer-collector` y depender de `core` y `adapters` como paquetes del workspace.

#### Scenario: Instalación del workspace
- **WHEN** se ejecuta `pnpm install` y `pnpm build` en la raíz del repo
- **THEN** los tres paquetes compilan y el binario `tokenviewer-collector` es ejecutable (p. ej. vía `pnpm --filter collector exec tokenviewer-collector --help`)

### Requirement: Configuración local del collector
El collector SHALL leer su configuración local respetando las rutas de plataforma existentes y SHALL aceptar `machineName`, limitado a `angel-mac` o `mac-m5`, la ruta del checkout operativo y `agents`. La configuración MUST NOT requerir URL, token o credencial de un servidor de TokenViewer y MUST NOT persistir credenciales Git.

#### Scenario: Configuración de una publicadora
- **WHEN** el config declara una identidad activa y un checkout operativo válido
- **THEN** el collector limita la generación a la carpeta de esa identidad usando credenciales Git externas

#### Scenario: Configuración inválida
- **WHEN** el config declara una identidad no publicadora, JSON malformado o tipos erróneos
- **THEN** el comando termina con exit code distinto de 0 antes de escribir datos

### Requirement: Generación y publicación de snapshots
El binario `tokenviewer-collector` SHALL generar los snapshots pendientes de la máquina configurada, validarlos y, cuando corresponda, publicar el cambio mediante el flujo Git existente. La operación MUST limitar la identidad publicadora a `angel-mac` o `mac-m5` y MUST terminar con exit code distinto de 0 si generación, validación, commit o publicación fallan.

#### Scenario: Generación local válida
- **WHEN** se ejecuta el collector para una identidad activa con fuentes disponibles
- **THEN** crea o actualiza únicamente sus snapshots v2 permitidos y reporta los agregados diarios

### Requirement: Comando run con modo dry-run
`tokenviewer-collector run --dry-run` SHALL escanear los agentes seleccionados, calcular costes localmente y emitir un resumen de los snapshots que produciría sin escribir ficheros, crear commits, ejecutar Git ni realizar transporte interno de TokenViewer. El resumen MUST omitir registros individuales y campos privados.

#### Scenario: Previsualización sin efectos
- **WHEN** se ejecuta `run --dry-run` con fuentes de varios días
- **THEN** stdout resume agregados diarios y no cambia snapshots ni estado Git

### Requirement: Comando status
`tokenviewer-collector status` SHALL mostrar agentes detectados, identidad configurada, última ejecución, commit pendiente y cobertura de snapshots de la carpeta propia. El comando MUST funcionar sin backend, Docker ni base de datos propia.

#### Scenario: Estado local
- **WHEN** se ejecuta `status` en un checkout configurado
- **THEN** informa cobertura y pendientes sin contactar un servicio de TokenViewer
