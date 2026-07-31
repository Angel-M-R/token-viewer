## MODIFIED Requirements

### Requirement: SPA servida como estáticos por el servidor
El dashboard MUST ser una SPA React, Vite y TypeScript ubicada en `apps/web`, ejecutada localmente desde el checkout. Su build MUST cargar snapshots v2 versionados y MUST NOT depender de `apps/server`, proxy, contenedor ni hosting de aplicación.

#### Scenario: Acceso local al dashboard
- **WHEN** un usuario inicia el dashboard desde un checkout válido
- **THEN** la SPA arranca y carga datos locales sin proceso backend

#### Scenario: Desarrollo local
- **WHEN** un desarrollador inicia Vite
- **THEN** la SPA usa la misma capa local sin proxy de API

### Requirement: Data-fetching con caché por filtros y polling
El dashboard SHALL usar TanStack Query para coordinar consultas locales, con la combinación de filtros formando parte de la query key. Los datos SHALL proceder del conjunto cargado y MUST NOT requerir polling ni refetch de red.

#### Scenario: Caché por combinación de filtros
- **WHEN** el usuario vuelve a una combinación todavía disponible
- **THEN** las vistas se pintan desde la consulta local cacheada

#### Scenario: Dashboard abierto
- **WHEN** el dashboard permanece visible
- **THEN** no inicia polling contra un servicio de TokenViewer

## REMOVED Requirements

### Requirement: Autenticación opcional por token de dashboard
**Reason**: El dashboard local no consume una API de TokenViewer.
**Migration**: Cargar directamente snapshots v2 del checkout sin token Bearer.

#### Scenario: Carga sin token
- **WHEN** el usuario abre el dashboard local
- **THEN** las vistas cargan sin pantalla de autenticación ni secreto de servidor
