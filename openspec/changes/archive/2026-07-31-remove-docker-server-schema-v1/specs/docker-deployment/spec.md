## REMOVED Requirements

### Requirement: Imagen Docker multi-stage
**Reason**: TokenViewer se ejecuta como collector y dashboard local sin imagen propia.
**Migration**: Usar los scripts locales existentes de instalación, build y ejecución.

#### Scenario: Build local
- **WHEN** se construye el proyecto después de la limpieza
- **THEN** el build termina sin Docker ni una imagen de TokenViewer

### Requirement: Servido de estáticos del dashboard
**Reason**: No existe servidor de TokenViewer que hospede la SPA.
**Migration**: Ejecutar el dashboard local mediante Vite y snapshots del checkout.

#### Scenario: Dashboard local
- **WHEN** el usuario inicia el dashboard
- **THEN** carga snapshots v2 sin servidor de aplicación

### Requirement: docker-compose con persistencia
**Reason**: La persistencia propia son snapshots v2 versionados y no una base de datos en contenedor.
**Migration**: Usar el checkout operativo y la publicación Git existentes.

#### Scenario: Operación posterior a la limpieza
- **WHEN** las publicadoras ejecutan el flujo diario
- **THEN** no requieren compose, volumen propio, tokens de servidor ni puerto de aplicación
