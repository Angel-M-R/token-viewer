## ADDED Requirements

### Requirement: Alta de máquina con emisión de token
El servidor SHALL exponer `POST /api/v1/machines/register`, protegido por `ADMIN_TOKEN` (Bearer), que da de alta una máquina con `name` (único) y `os`, y devuelve un `machineToken` con prefijo `tv_`. El token MUST devolverse una única vez y en la base de datos MUST persistirse solo su hash SHA-256 (`machines.token_hash`), nunca el token en claro.

#### Scenario: Registro correcto
- **WHEN** llega `POST /api/v1/machines/register` con Bearer igual a `ADMIN_TOKEN` y body `{name: "macbook-angel", os: "darwin"}`
- **THEN** se crea la fila en `machines` con `name`, `os`, `created_at` y `token_hash = sha256(machineToken)`
- **THEN** la respuesta incluye el `machineToken` en claro (única vez que se expone)

#### Scenario: Registro sin ADMIN_TOKEN válido
- **WHEN** llega `POST /api/v1/machines/register` sin cabecera `Authorization` o con un Bearer distinto de `ADMIN_TOKEN`
- **THEN** el servidor responde `401` y no crea ninguna máquina

#### Scenario: Re-registro de un nombre existente rota el token
- **WHEN** llega un registro válido con un `name` que ya existe
- **THEN** el servidor genera un nuevo `machineToken`, actualiza `token_hash` de esa máquina y devuelve el nuevo token
- **THEN** el token anterior deja de ser válido para `/ingest`

### Requirement: Autenticación de colectores por token de máquina
El servidor SHALL autenticar `POST /api/v1/ingest` mediante `Authorization: Bearer <machineToken>`: MUST hashear con SHA-256 el token recibido, localizar la máquina por `token_hash` con comparación en tiempo constante y asociar los registros ingeridos a esa `machine_id`. Un token no reconocido MUST producir `401` sin escribir nada.

#### Scenario: Token de máquina válido
- **WHEN** un colector envía un lote a `/api/v1/ingest` con un `machineToken` emitido en el registro
- **THEN** el servidor resuelve la máquina por `sha256(token)` y procesa el lote asociado a su `machine_id`

#### Scenario: Token inválido o revocado
- **WHEN** un colector envía un lote con un token desconocido o rotado
- **THEN** el servidor responde `401` y no inserta ningún registro

### Requirement: Listado de máquinas con actividad
El servidor SHALL exponer `GET /api/v1/machines` (protegido por `ADMIN_TOKEN`) con la lista de máquinas registradas incluyendo `name`, `os`, `created_at`, `last_seen_at` y totales de uso (requests y tokens). El campo `last_seen_at` MUST actualizarse en cada ingesta autenticada de esa máquina. La respuesta MUST NOT incluir `token_hash` ni tokens.

#### Scenario: Listado tras actividad
- **WHEN** una máquina registrada completa una ingesta y después se consulta `GET /api/v1/machines` con `ADMIN_TOKEN`
- **THEN** la respuesta incluye esa máquina con `last_seen_at` actualizado al momento de la ingesta y sus totales acumulados

#### Scenario: El listado no expone secretos
- **WHEN** se consulta `GET /api/v1/machines`
- **THEN** ninguna entrada contiene `token_hash` ni ningún token de máquina
