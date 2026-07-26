## ADDED Requirements

### Requirement: Tabla quota_snapshots extensible por proveedor
El servidor SHALL persistir los snapshots de cuota en una tabla `quota_snapshots` con las columnas `id` (PK), `machine_id` (FK a `machines`, NOT NULL), `provider` (TEXT NOT NULL), `taken_at` (TEXT NOT NULL, UTC), `percent_used` (REAL, nullable), `plan` (TEXT, nullable), `resets_at` (TEXT, nullable) y `raw` (TEXT, JSON completo de la respuesta del proveedor). El esquema MUST ser agnóstico del proveedor: `provider` es texto libre (`"copilot"` en esta fase) para admitir futuros proveedores de ventana de cuota sin cambios de esquema.

#### Scenario: Persistencia de un snapshot de Copilot
- **WHEN** se acepta un snapshot de Copilot
- **THEN** se inserta una fila con `provider = "copilot"`, la máquina emisora, `taken_at` en UTC y el JSON original en `raw`

#### Scenario: Snapshot con campos opcionales ausentes
- **WHEN** un snapshot llega sin `percent_used`, `plan` o `resets_at`
- **THEN** la fila se inserta con esas columnas a NULL, sin rechazar el snapshot

### Requirement: Endpoint POST /api/v1/ingest-quota con auth de máquina
El servidor SHALL exponer `POST /api/v1/ingest-quota`, autenticado con el mismo Bearer `machineToken` que `POST /api/v1/ingest`. El cuerpo MUST validarse con esquema compartido (zod en `packages/core`): peticiones sin token válido MUST recibir 401 y cuerpos inválidos MUST recibir 400.

#### Scenario: Ingesta autenticada válida
- **WHEN** una máquina registrada envía un snapshot bien formado con su Bearer token
- **THEN** el servidor responde 2xx e indica en la respuesta si el snapshot fue aceptado

#### Scenario: Token de máquina inválido
- **WHEN** la petición llega sin Bearer token o con uno que no corresponde a ninguna máquina
- **THEN** el servidor responde 401 y no persiste nada

#### Scenario: Cuerpo inválido
- **WHEN** el cuerpo no cumple el esquema (p. ej. falta `provider` o `taken_at`)
- **THEN** el servidor responde 400 con detalle del error de validación

### Requirement: Dedup blando por máquina y proveedor
El servidor SHALL descartar un snapshot entrante si el último snapshot persistido de esa misma `machine_id` y `provider` tiene menos de 5 minutos, usando la hora del servidor como referencia. El descarte MUST responder 2xx indicando que no se aceptó (p. ej. `{accepted: false}`), para que el colector no reintente.

#### Scenario: Snapshot demasiado reciente
- **WHEN** una máquina envía un snapshot de Copilot y su snapshot anterior de Copilot tiene menos de 5 minutos
- **THEN** el servidor responde 2xx con `accepted: false` y no inserta fila nueva

#### Scenario: Snapshot pasado el umbral
- **WHEN** el último snapshot de esa máquina/provider tiene 5 minutos o más
- **THEN** el servidor inserta el snapshot y responde con `accepted: true`

#### Scenario: Máquinas distintas no se bloquean entre sí
- **WHEN** dos máquinas distintas envían snapshots de Copilot con segundos de diferencia
- **THEN** ambos se aceptan, porque el dedup se evalúa por máquina y proveedor

### Requirement: API de lectura de snapshots deduplicada por cuenta
El servidor SHALL exponer un endpoint de lectura de snapshots para el dashboard que, dado un proveedor y el rango temporal filtrado, devuelva los datos agrupados por cuenta del proveedor (login de GitHub extraído de `raw` para Copilot): por cada cuenta, el snapshot más reciente (porcentaje, plan, `resets_at`, `taken_at`) y la serie temporal de `percent_used` del periodo. Los snapshots de varias máquinas de la misma cuenta MUST colapsarse en una sola cuenta.

#### Scenario: Dos máquinas con la misma cuenta
- **WHEN** dos máquinas han enviado snapshots de la misma cuenta de GitHub en el periodo
- **THEN** la respuesta contiene una única entrada para esa cuenta, con su snapshot más reciente y una serie temporal combinada sin duplicar puntos simultáneos

#### Scenario: Cuentas distintas
- **WHEN** existen snapshots de dos cuentas de GitHub distintas en el periodo
- **THEN** la respuesta contiene una entrada por cada cuenta con sus datos separados

#### Scenario: Sin snapshots en el periodo
- **WHEN** no hay snapshots del proveedor en el rango filtrado
- **THEN** la respuesta es una lista vacía y el dashboard puede omitir la card
