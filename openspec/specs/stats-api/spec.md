# stats-api Specification

## Purpose
TBD - created by archiving change fase-2-servidor-central. Update Purpose after archive.
## Requirements
### Requirement: Filtros comunes y agregación en SQL
Todos los endpoints `GET /api/v1/stats/*` y `GET /api/v1/records` SHALL aceptar los filtros comunes `machine`, `agent`, `provider`, `model` (repetibles) y `from`/`to` (fecha ISO), validados con zod. La agregación MUST ejecutarse íntegramente en SQL (expresiones `strftime`, `SUM`, `COUNT`, `GROUP BY`) apoyada en los índices `(ts)`, `(machine_id, ts)`, `(agent, ts)`, `(model, ts)`; `stats/daily` sobre 1M de registros MUST responder en menos de 500 ms. Si está definido `DASHBOARD_TOKEN`, estos endpoints MUST exigir ese Bearer; si no está definido, quedan abiertos en la red local.

#### Scenario: Filtros combinados
- **WHEN** se consulta `GET /api/v1/stats/daily?from=2026-06-01&to=2026-06-30&agent=claude&agent=codex&machine=macbook-angel`
- **THEN** la serie solo incluye registros de esa máquina y de esos dos agentes dentro del rango

#### Scenario: Dashboard protegido opcionalmente
- **WHEN** `DASHBOARD_TOKEN` está definido y una petición a `stats/*` llega sin ese Bearer
- **THEN** el servidor responde `401`

#### Scenario: Parámetro inválido
- **WHEN** `from` o `to` no son fechas ISO válidas
- **THEN** el servidor responde `400` con un mensaje descriptivo

### Requirement: Resumen de totales
`GET /api/v1/stats/summary` SHALL devolver, para el rango filtrado: tokens por tipo (input, output, reasoning, cache_read, cache_write), coste estimado total (`SUM(cost_usd)`), coste facturado total, número de requests, número de requests "sin precio" (`cost_usd IS NULL`) y número de modelos distintos.

#### Scenario: Summary con registros sin precio
- **WHEN** el rango contiene 90 registros con coste y 10 con `cost_usd = NULL`
- **THEN** el summary reporta `requests = 100`, `unpricedRequests = 10` y el coste total suma solo los 90 con precio

### Requirement: Serie diaria agrupable
`GET /api/v1/stats/daily` SHALL devolver una serie por día (`strftime('%Y-%m-%d', ts)` en UTC) con tokens, coste y requests, y SHALL aceptar `groupBy=agent|model|machine` para desglosar cada día por esa dimensión.

#### Scenario: Serie diaria agrupada por agente
- **WHEN** se consulta `stats/daily?groupBy=agent` sobre un rango con actividad de claude y codex
- **THEN** cada día del resultado desglosa tokens, coste y requests por cada agente

### Requirement: Heatmap horario con zona horaria
`GET /api/v1/stats/heatmap` SHALL devolver una matriz 7×24 (día de semana × hora) con `metric=tokens|cost|requests`, agrupando por la hora local de la zona IANA indicada en `tz` (por defecto UTC). La conversión MUST resolverse en el servidor aplicando el offset de la zona sobre los `ts` UTC, correcto también en rangos que cruzan cambio de horario. Una `tz` inválida MUST producir `400`.

#### Scenario: Agrupación por hora local
- **WHEN** se consulta `stats/heatmap?metric=requests&tz=Europe/Madrid` con un registro a las `23:30 UTC` de un martes (verano, UTC+2)
- **THEN** el registro cuenta en la celda miércoles/01, no en martes/23

#### Scenario: Zona horaria inválida
- **WHEN** se consulta el heatmap con `tz=Marte/Olympus`
- **THEN** el servidor responde `400`

### Requirement: Desglose por modelo
`GET /api/v1/stats/models` SHALL devolver el desglose por modelo del rango filtrado: proveedor, modelo, requests, tokens por tipo, coste estimado, coste facturado y requests sin precio.

#### Scenario: Ranking de modelos
- **WHEN** se consulta `stats/models` sobre un rango con varios modelos
- **THEN** cada entrada agrega los totales de su modelo y el conjunto cubre todos los registros del rango

### Requirement: Drill-down paginado de registros
`GET /api/v1/records` SHALL devolver registros individuales ordenados por `ts` descendente, paginados por cursor keyset (`limit` + `cursor` opaco); la respuesta MUST incluir el cursor de la página siguiente cuando existan más resultados. La paginación MUST NOT usar OFFSET.

#### Scenario: Paginación estable
- **WHEN** se consulta `records?limit=100` y luego se repite la consulta con el `cursor` devuelto
- **THEN** la segunda página continúa exactamente donde terminó la primera, sin registros repetidos ni omitidos

### Requirement: Liveness
El servidor SHALL exponer `GET /health` sin autenticación, respondiendo `200` cuando el proceso está vivo y la base de datos es accesible.

#### Scenario: Healthcheck
- **WHEN** se consulta `GET /health` con el servidor levantado
- **THEN** responde `200`

