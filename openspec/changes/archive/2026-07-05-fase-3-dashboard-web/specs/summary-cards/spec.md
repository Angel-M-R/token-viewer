## ADDED Requirements

### Requirement: Cards de resumen del periodo
La vista de resumen SHALL mostrar, a partir de `GET /api/v1/stats/summary` con los filtros globales aplicados, cards con: total de tokens, coste estimado en USD, número de requests y número de máquinas activas.

#### Scenario: Carga del resumen
- **WHEN** el usuario abre el dashboard con un rango de fechas seleccionado
- **THEN** se muestran las cuatro cards con los totales del periodo devueltos por `stats/summary`

#### Scenario: Periodo sin datos
- **WHEN** los filtros seleccionados no devuelven ningún dato
- **THEN** las cards muestran valores a cero y un estado vacío claro, sin errores

### Requirement: Desglose de tokens en tooltip
La card de tokens totales SHALL mostrar en un tooltip el desglose por tipo: input, output y cache.

#### Scenario: Tooltip de desglose
- **WHEN** el usuario pasa el cursor sobre la card de tokens totales
- **THEN** un tooltip muestra los tokens de input, output y cache por separado

### Requirement: Delta vs periodo anterior equivalente
Cada card SHALL mostrar el delta respecto al periodo inmediatamente anterior de la misma duración (p. ej. últimos 30 días vs los 30 días previos), indicando dirección (subida/bajada) y magnitud.

#### Scenario: Cálculo del delta
- **WHEN** el rango activo son los últimos 7 días y el coste es de 12 USD frente a 10 USD de los 7 días anteriores
- **THEN** la card de coste muestra un delta positivo de +20 %

#### Scenario: Periodo anterior sin datos
- **WHEN** el periodo anterior equivalente no tiene ningún dato
- **THEN** la card omite el delta (o lo marca como no disponible) en lugar de mostrar un porcentaje engañoso
