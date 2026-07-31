# usage-ingestion Specification

## Purpose
TBD - created by archiving change fase-2-servidor-central. Update Purpose after archive.
## Requirements
### Requirement: Procesamiento local efímero
El collector SHALL procesar cada `UsageRecord` únicamente en memoria para deduplicarlo, calcular su coste y agregarlo por día local `Europe/Madrid` antes de escribir un snapshot v2. TokenViewer MUST NOT persistir registros individuales en una base propia, ficheros versionados ni payloads de red.

#### Scenario: Registro normalizado
- **WHEN** un adaptador emite un registro con métricas y campos privados
- **THEN** el collector incorpora solo dimensiones y métricas permitidas al agregado y descarta el registro efímero
