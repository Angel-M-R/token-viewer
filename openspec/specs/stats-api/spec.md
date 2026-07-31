# stats-api Specification

## Purpose
TBD - created by archiving change fase-2-servidor-central. Update Purpose after archive.
## Requirements
### Requirement: Filtros comunes y agregación en SQL
Todas las consultas locales de estadísticas SHALL aceptar filtros de máquina, agente, proveedor, modelo y rango de fechas, validarlos y aplicarlos sobre filas diarias v2. La agregación MUST ejecutarse en la capa local del dashboard sin SQL, servidor ni autenticación.

#### Scenario: Filtros combinados
- **WHEN** se selecciona una máquina, dos agentes y un rango
- **THEN** todas las métricas incluyen únicamente las filas que cumplen esos filtros

#### Scenario: Parámetro inválido
- **WHEN** el rango o un valor no valida contra el contrato local
- **THEN** la consulta devuelve un error descriptivo sin resultados parciales

### Requirement: Resumen de totales
La consulta local de resumen SHALL devolver tokens por tipo, coste estimado, coste facturado, solicitudes, solicitudes sin precio y modelos distintos para el rango filtrado.

#### Scenario: Resumen con solicitudes sin precio
- **WHEN** el rango contiene solicitudes valoradas y no valoradas
- **THEN** el resumen cuenta todas y suma solo costes disponibles

### Requirement: Serie diaria agrupable
La consulta local diaria SHALL agrupar por fecha tokens, costes y solicitudes y SHALL admitir desglose por agente, modelo o máquina.

#### Scenario: Serie agrupada por agente
- **WHEN** el rango contiene varios agentes y se agrupa por agente
- **THEN** cada fecha desglosa sus métricas por agente

### Requirement: Heatmap horario con zona horaria
La consulta local de heatmap SHALL devolver valores diarios para tokens, coste o solicitudes usando directamente la fecha de cada snapshot. MUST NOT aceptar zona horaria ni producir una matriz horaria.

#### Scenario: Calendar heatmap diario
- **WHEN** el rango contiene snapshots de varias fechas
- **THEN** cada entrada corresponde al total agregado de una fecha

### Requirement: Desglose por modelo
La consulta local de modelos SHALL devolver proveedor, modelo, solicitudes, tokens, coste estimado, coste facturado y solicitudes sin precio combinando filas diarias del rango.

#### Scenario: Ranking de modelos
- **WHEN** el rango contiene varios modelos
- **THEN** cada entrada agrega su modelo y el conjunto cubre todas las filas filtradas
