# dashboard-shell Specification

## Purpose
TBD - created by archiving change fase-3-dashboard-web. Update Purpose after archive.
## Requirements
### Requirement: SPA servida como estáticos por el servidor
El dashboard MUST ser una SPA React + Vite + TypeScript ubicada en `apps/web`, cuyo build de producción se sirve como ficheros estáticos desde `apps/server`, sin requerir un proceso de frontend separado en despliegue.

#### Scenario: Acceso al dashboard desde el servidor
- **WHEN** un usuario navega a la raíz `/` del servidor desplegado
- **THEN** el servidor devuelve el `index.html` del build de `apps/web` y la SPA arranca en el navegador

#### Scenario: Desarrollo local contra la API
- **WHEN** un desarrollador arranca `apps/web` en modo desarrollo (Vite dev server)
- **THEN** las peticiones a `/api/*` se enrutan (proxy) al servidor local sin cambios de código

### Requirement: Data-fetching con caché por filtros y polling
El dashboard SHALL obtener todos los datos vía TanStack Query, con la combinación de filtros globales formando parte de la query key, refetch al recuperar el foco de la ventana y polling automático cada 60 segundos.

#### Scenario: Polling periódico
- **WHEN** el dashboard permanece abierto y visible durante más de 60 segundos
- **THEN** los datos de las vistas se refrescan automáticamente sin interacción del usuario

#### Scenario: Caché por combinación de filtros
- **WHEN** el usuario vuelve a una combinación de filtros consultada previamente y aún fresca en caché
- **THEN** las vistas se pintan de inmediato desde la caché sin esperar a la red

#### Scenario: Refetch al recuperar el foco
- **WHEN** el usuario vuelve a la pestaña del dashboard después de tenerla en segundo plano
- **THEN** las queries obsoletas se refrescan automáticamente

### Requirement: Tema claro y oscuro
El dashboard SHALL seguir la preferencia `prefers-color-scheme` del sistema, aplicando el tema tanto a la interfaz como a los charts de ECharts (temas claro y oscuro registrados).

#### Scenario: Sistema en modo oscuro
- **WHEN** el sistema operativo del usuario tiene activado el modo oscuro
- **THEN** la interfaz y todos los charts se renderizan con el tema oscuro

#### Scenario: Cambio de tema en caliente
- **WHEN** el usuario cambia el tema del sistema con el dashboard abierto
- **THEN** la interfaz y los charts se actualizan al nuevo tema sin recargar la página ni perder los filtros

### Requirement: Autenticación opcional por token de dashboard
Si el servidor define `DASHBOARD_TOKEN`, el dashboard MUST mostrar una pantalla de introducción de token antes de mostrar datos; el token se guarda en `localStorage` y se envía como `Authorization: Bearer` en todas las peticiones a la API. Si el servidor no define `DASHBOARD_TOKEN`, el dashboard MUST cargar directamente sin pedir token.

#### Scenario: Servidor protegido con token
- **WHEN** la API responde 401 a la petición inicial del dashboard
- **THEN** se muestra la pantalla de token y no se renderiza ninguna vista de datos

#### Scenario: Token válido introducido
- **WHEN** el usuario introduce un token que la API acepta
- **THEN** el token se persiste en `localStorage`, se añade como Bearer a las peticiones siguientes y el dashboard muestra las vistas

#### Scenario: Token revocado
- **WHEN** una petición con el token almacenado recibe 401
- **THEN** el token se elimina de `localStorage` y se vuelve a mostrar la pantalla de token

#### Scenario: Servidor sin token configurado
- **WHEN** el servidor no define `DASHBOARD_TOKEN` y el usuario abre el dashboard
- **THEN** las vistas cargan directamente sin pantalla de token

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

