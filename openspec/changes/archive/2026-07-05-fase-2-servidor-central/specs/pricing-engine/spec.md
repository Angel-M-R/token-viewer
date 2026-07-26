## ADDED Requirements

### Requirement: Catálogo de precios cacheado de models.dev
El servidor SHALL obtener las tarifas de `https://models.dev/api.json` y cachearlas en la tabla `pricing_catalog` (`fetched_at`, `payload` JSON) con TTL de 7 días. Si el fetch falla, el servidor MUST usar la versión cacheada aunque esté caducada (stale) y, en su defecto, los fallbacks embebidos portados de devrage. Un fallo de pricing MUST NOT hacer fallar una ingesta.

#### Scenario: Caché fresca
- **WHEN** hay una fila en `pricing_catalog` con `fetched_at` dentro del TTL de 7 días
- **THEN** el servidor usa ese payload sin llamar a models.dev

#### Scenario: Caché caducada con red disponible
- **WHEN** la caché supera el TTL y el fetch a models.dev responde correctamente
- **THEN** el servidor actualiza `pricing_catalog` con el nuevo payload y `fetched_at` actual

#### Scenario: Fetch fallido con caché caducada
- **WHEN** la caché está caducada y el fetch a models.dev falla o supera el timeout
- **THEN** el servidor usa el payload caducado (fuente `stale-catalog`) y la ingesta continúa con normalidad

### Requirement: Coste congelado al ingerir
El servidor SHALL calcular `cost_usd` en el momento de la ingesta con el catálogo vigente, aplicando la fórmula por millón de tokens `input·rate_in + cache_read·rate_cr + cache_write·rate_cw + (output+reasoning)·rate_out`, con fallback de las tarifas de caché a la tarifa de input, alias de proveedor/modelo, inferencia de proveedor por prefijo y tiers de contexto (portado de `references/devrage/src/pricing/index.ts`). El coste MUST quedar congelado: cambios posteriores del catálogo MUST NOT alterar filas ya ingeridas. Cada fila MUST registrar `pricing_source` (`catalog` | `fallback` | `stored` | `unknown`).

#### Scenario: Modelo presente en el catálogo
- **WHEN** se ingiere un registro cuyo proveedor/modelo resuelve tarifas en el catálogo
- **THEN** la fila se guarda con `cost_usd` calculado con la fórmula y `pricing_source = "catalog"`

#### Scenario: El histórico no cambia al refrescar el catálogo
- **WHEN** el catálogo de models.dev cambia después de haber ingerido registros
- **THEN** los `cost_usd` ya guardados permanecen idénticos hasta que se invoque un reprice explícito

#### Scenario: Tier de contexto largo
- **WHEN** un registro supera el umbral de contexto definido por el modelo (tiers o `context_over_200k`)
- **THEN** el coste se calcula con las tarifas del tier correspondiente

### Requirement: Registro sin precio nunca inventa coste
Cuando no se resuelven tarifas para el proveedor/modelo de un registro, el servidor MUST guardar `cost_usd = NULL` con `pricing_source = "stored"` (si el registro trae `billed_cost_usd > 0`) o `"unknown"`. Estos registros MUST contabilizarse como "sin precio" (`unpricedRequests`) en `stats/summary` y su coste MUST NOT estimarse ni interpolarse. `billed_cost_usd` (real, solo opencode) MUST conservarse tal como llega y nunca recalcularse.

#### Scenario: Modelo desconocido
- **WHEN** se ingiere un registro con un modelo que no existe en catálogo ni en fallbacks
- **THEN** la fila se guarda con `cost_usd = NULL` y `pricing_source = "unknown"`
- **THEN** `stats/summary` lo cuenta en `unpricedRequests` y no suma coste inventado

#### Scenario: Coste facturado real sin tarifa de catálogo
- **WHEN** un registro de opencode trae `billed_cost_usd > 0` pero su modelo no resuelve tarifas
- **THEN** la fila se guarda con `cost_usd = NULL`, `pricing_source = "stored"` y `billed_cost_usd` intacto

### Requirement: Reprice administrativo del histórico
El servidor SHALL exponer `POST /api/v1/admin/reprice`, protegido por `ADMIN_TOKEN`, que recalcula `cost_usd` y `pricing_source` de todas las filas de `usage_records` con el catálogo vigente, en transacción, y devuelve el número de filas actualizadas. `billed_cost_usd` MUST NOT modificarse.

#### Scenario: Reprice tras corrección de tarifas
- **WHEN** models.dev corrige la tarifa de un modelo y un administrador llama a `POST /api/v1/admin/reprice`
- **THEN** todas las filas de ese modelo pasan a reflejar el nuevo coste y la respuesta indica cuántas filas se actualizaron

#### Scenario: Reprice resuelve precios que antes faltaban
- **WHEN** existen filas con `cost_usd = NULL` porque su modelo no estaba en el catálogo y el catálogo vigente ya lo incluye
- **THEN** tras el reprice esas filas obtienen `cost_usd` calculado y `pricing_source = "catalog"`

#### Scenario: Reprice sin autorización
- **WHEN** se llama a `/api/v1/admin/reprice` sin `ADMIN_TOKEN` válido
- **THEN** el servidor responde `401` y no modifica ninguna fila
