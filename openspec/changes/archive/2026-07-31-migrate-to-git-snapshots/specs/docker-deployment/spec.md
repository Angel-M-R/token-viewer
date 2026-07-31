## REMOVED Requirements

### Requirement: Imagen Docker multi-stage
**Reason**: El dashboard se ejecutará exclusivamente en local y el backend se retira.
**Migration**: Usar los scripts locales de instalación, build y ejecución del dashboard y collector sin imagen Docker.

#### Scenario: Build migrado
- **WHEN** finaliza el corte
- **THEN** CI y la operación no construyen ni requieren una imagen de TokenViewer

### Requirement: Servido de estáticos del dashboard
**Reason**: No existe servidor que hospede los estáticos.
**Migration**: Ejecutar el dashboard local mediante su build o servidor de desarrollo estático, cargando snapshots del checkout.

#### Scenario: Dashboard local
- **WHEN** el usuario abre TokenViewer después del corte
- **THEN** el dashboard funciona localmente sin contenedor ni rutas `/api/v1/*`

### Requirement: docker-compose con persistencia
**Reason**: Docker, servidor y SQLite propia se eliminan tras validar el snapshot completo.
**Migration**: Sustituir compose por el checkout operativo, el job diario de `launchd` y snapshots Git; la salvaguarda de reversión es una copia offline no versionada del repositorio previo a la reescritura de historial, no una copia de la SQLite anterior, que ya no existe.

#### Scenario: Operación posterior al corte
- **WHEN** `angel-mac` y `mac-m5` ejecutan el flujo diario validado y `old-mac` permanece histórica
- **THEN** no se necesita `docker compose`, volumen de datos, `ADMIN_TOKEN`, `DASHBOARD_TOKEN` ni puerto 8484
