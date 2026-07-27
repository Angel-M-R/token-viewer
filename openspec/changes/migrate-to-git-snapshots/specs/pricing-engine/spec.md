## MODIFIED Requirements

### Requirement: Catálogo de precios cacheado de models.dev
El collector SHALL obtener localmente las tarifas de `https://models.dev/api.json` y cachearlas fuera del repositorio con TTL de 7 días. Si el fetch falla, MUST usar una versión local caducada y, en su defecto, los fallbacks embebidos. Un fallo de pricing MUST NOT impedir el escaneo, pero cada registro sin tarifa resoluble MUST quedar contabilizado como sin precio en su agregado.

#### Scenario: Caché local fresca
- **WHEN** el catálogo local fue obtenido dentro del TTL de 7 días
- **THEN** el collector lo usa sin llamar a models.dev

#### Scenario: Fetch fallido con caché caducada
- **WHEN** el catálogo está caducado y la red falla
- **THEN** el collector usa la copia caducada, marca la fuente de pricing correspondiente y continúa

#### Scenario: Sin catálogo utilizable
- **WHEN** no existe caché y los fallbacks no contienen el modelo
- **THEN** el registro se agrega como solicitud sin precio sin inventar coste

### Requirement: Coste congelado al ingerir
El collector SHALL calcular `costUsd` localmente para cada registro antes de agregarlo, aplicando la fórmula por millón de tokens, aliases, inferencia de proveedor y tiers de contexto existentes. El coste resultante MUST quedar congelado cuando se publica el día cerrado: refrescos posteriores del catálogo MUST NOT reescribir snapshots cerrados salvo una reparación explícita y validada.

#### Scenario: Modelo presente en catálogo
- **WHEN** un registro resuelve proveedor, modelo y tarifas
- **THEN** su coste se calcula antes de sumarlo a la fila horaria y la fila conserva la suma resultante

#### Scenario: Catálogo actualizado después del cierre
- **WHEN** models.dev cambia después de publicar un día cerrado
- **THEN** la ejecución diaria normal no altera el coste de ese día

#### Scenario: Tier de contexto largo
- **WHEN** un registro supera el umbral de contexto definido por el modelo
- **THEN** el coste previo a agregación usa las tarifas del tier correspondiente

### Requirement: Registro sin precio nunca inventa coste
Cuando no se resuelven tarifas, el collector MUST dejar ausente o nulo el coste estimado de ese registro y sumar uno a `unpricedRequests`. El coste facturado real, cuando exista, MUST sumarse sin convertirse en coste estimado; el snapshot MUST permitir distinguir coste estimado, coste facturado y solicitudes sin precio.

#### Scenario: Modelo desconocido
- **WHEN** un registro usa un modelo ausente de catálogo y fallbacks
- **THEN** incrementa solicitudes y solicitudes sin precio, pero no el coste estimado

#### Scenario: Coste facturado sin tarifa
- **WHEN** un registro de OpenCode incluye coste facturado pero no resuelve tarifa
- **THEN** el agregado conserva el coste facturado y sigue contando una solicitud sin precio estimado

## REMOVED Requirements

### Requirement: Reprice administrativo del histórico
**Reason**: No existe servidor ni tabla de registros y los días cerrados son inmutables por defecto.
**Migration**: Usar una reparación explícita de snapshots, con revisión del diff y validación completa, solo cuando se apruebe recalcular un día.

#### Scenario: Sin endpoint de reprice
- **WHEN** finaliza el corte
- **THEN** `POST /api/v1/admin/reprice` deja de existir y un refresco de catálogo no modifica el histórico automáticamente
