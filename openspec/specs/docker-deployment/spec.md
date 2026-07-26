# docker-deployment Specification

## Purpose
TBD - created by archiving change fase-2-servidor-central. Update Purpose after archive.
## Requirements
### Requirement: Imagen Docker multi-stage
El proyecto SHALL incluir `docker/Dockerfile` multi-stage: un stage de build con Node 22 y pnpm que compila `apps/server` y `apps/web`, y una imagen final basada en `node:22-slim` que contiene solo el build del servidor, las dependencias de producción (incluido el binario nativo del driver SQLite compilado para la misma versión de Node) y los estáticos del dashboard.

#### Scenario: Build de la imagen
- **WHEN** se construye la imagen desde la raíz del monorepo
- **THEN** el build multi-stage termina sin errores y la imagen final no contiene dependencias de desarrollo ni el código fuente sin compilar

### Requirement: Servido de estáticos del dashboard
El servidor SHALL servir el build estático del dashboard (`apps/web/dist`, copiado a la imagen) con fallback a `index.html` para rutas de SPA que no sean de la API. Si el directorio de estáticos no existe (dashboard aún no construido), el servidor MUST arrancar igualmente y la API MUST funcionar con normalidad.

#### Scenario: Dashboard servido por el contenedor
- **WHEN** el contenedor corre con el build del dashboard incluido y se pide `GET /`
- **THEN** responde el `index.html` del dashboard, y las rutas `/api/v1/*` siguen respondiendo la API

#### Scenario: Arranque sin dashboard
- **WHEN** el directorio de estáticos no existe
- **THEN** el servidor arranca, `/health` y la API funcionan, y `/` devuelve un 404 informativo

### Requirement: docker-compose con persistencia
El proyecto SHALL incluir `docker/docker-compose.yml` con un único servicio: puerto `8484` publicado, volumen `./data:/data` con la BD SQLite en `/data/tokenviewer.db`, y variables de entorno `ADMIN_TOKEN` (requerida), `DASHBOARD_TOKEN` (opcional) y `PORT` (opcional, por defecto 8484). El servidor MUST aplicar sus migraciones al arrancar y MUST rehusar arrancar si falta `ADMIN_TOKEN`.

#### Scenario: Arranque con compose
- **WHEN** se ejecuta `docker compose up` con `ADMIN_TOKEN` definido
- **THEN** el contenedor levanta, crea/migra la BD en `/data/tokenviewer.db` y `GET /health` responde `200` en el puerto 8484

#### Scenario: Persistencia tras recrear el contenedor
- **WHEN** se ingieren datos, se destruye el contenedor (`docker compose down`) y se vuelve a levantar
- **THEN** los datos siguen presentes porque la BD vive en el volumen `./data`

#### Scenario: Falta ADMIN_TOKEN
- **WHEN** se arranca el servicio sin `ADMIN_TOKEN`
- **THEN** el proceso termina con error explicando la variable que falta

