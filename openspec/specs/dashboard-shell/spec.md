# dashboard-shell Specification

## Purpose
TBD - created by archiving change fase-3-dashboard-web. Update Purpose after archive.
## Requirements
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

### Requirement: Tema claro y oscuro
El dashboard SHALL seguir la preferencia `prefers-color-scheme` del sistema, aplicando el tema tanto a la interfaz como a los charts de ECharts (temas claro y oscuro registrados).

#### Scenario: Sistema en modo oscuro
- **WHEN** el sistema operativo del usuario tiene activado el modo oscuro
- **THEN** la interfaz y todos los charts se renderizan con el tema oscuro

#### Scenario: Cambio de tema en caliente
- **WHEN** el usuario cambia el tema del sistema con el dashboard abierto
- **THEN** la interfaz y los charts se actualizan al nuevo tema sin recargar la página ni perder los filtros

### Requirement: Layout responsive
El dashboard SHALL ser usable en una ventana de 1280 px y en móvil; los charts MUST redimensionarse automáticamente al cambiar el tamaño de su contenedor (resize observer).

#### Scenario: Redimensionado de la ventana
- **WHEN** el usuario redimensiona la ventana del navegador
- **THEN** todos los charts se redibujan ajustados al nuevo ancho sin recargar

### Requirement: Formateo consistente de valores
El dashboard SHALL formatear los tokens en forma abreviada (p. ej. `1.2M`), los costes en USD con 2 decimales y las fechas según el locale del navegador, en todas las vistas y tooltips.

#### Scenario: Formato de tokens y coste
- **WHEN** una vista muestra 1.234.567 tokens con coste 12,3456 USD
- **THEN** se renderizan como `1.2M` tokens y `$12.35`
