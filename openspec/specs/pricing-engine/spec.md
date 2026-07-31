# pricing-engine Specification

## Purpose
TBD - created by archiving change fase-2-servidor-central. Update Purpose after archive.
## Requirements
### Requirement: Catálogo de precios cacheado de models.dev
El collector SHALL obtener localmente las tarifas de `https://models.dev/api.json` y cachearlas fuera del repositorio con TTL de 7 días. Si el fetch falla, MUST usar una copia local caducada y, en su defecto, fallbacks embebidos. Un fallo de pricing MUST NOT impedir el escaneo y cada registro sin tarifa MUST contarse como no valorado.

#### Scenario: Caché local fresca
- **WHEN** el catálogo local está dentro del TTL
- **THEN** el collector lo usa sin llamar a models.dev

#### Scenario: Sin catálogo utilizable
- **WHEN** no existe caché utilizable ni fallback para el modelo
- **THEN** el registro se agrega como solicitud sin precio sin inventar coste

### Requirement: Coste congelado al ingerir
El collector SHALL calcular el coste localmente para cada registro antes de agregarlo, aplicando fórmula, aliases, inferencia y tiers existentes. El coste MUST quedar congelado al publicar un día cerrado y solo una reparación explícita y validada podrá cambiarlo.

#### Scenario: Modelo presente en catálogo
- **WHEN** un registro resuelve proveedor, modelo y tarifas
- **THEN** su coste se calcula antes de sumarlo a la fila diaria

#### Scenario: Catálogo actualizado después del cierre
- **WHEN** models.dev cambia después de publicar un día cerrado
- **THEN** la ejecución normal no altera ese snapshot

### Requirement: Registro sin precio nunca inventa coste
Cuando no se resuelven tarifas, el collector MUST incrementar `unpricedRequests` sin inventar coste estimado. El coste facturado real MUST sumarse por separado y el snapshot MUST distinguir ambas magnitudes.

#### Scenario: Modelo desconocido
- **WHEN** un registro no resuelve tarifa
- **THEN** incrementa solicitudes y solicitudes sin precio, pero no el coste estimado
