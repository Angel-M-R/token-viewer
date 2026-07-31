## ADDED Requirements

### Requirement: Carga local sin backend
El dashboard SHALL descubrir y cargar los snapshots versionados v2 directamente desde el checkout mediante Vite. La ejecución MUST NOT requerir backend HTTP, SQLite propia, Docker, Bearer token ni hosting de aplicación.

#### Scenario: Arranque local con snapshots
- **WHEN** el usuario inicia el dashboard desde un checkout con snapshots v2 válidos
- **THEN** las vistas cargan sus datos localmente sin peticiones a rutas de TokenViewer

### Requirement: Paridad visible del dashboard actual
El dashboard SHALL conservar sin cambios visibles el resumen, las cards de cuota, la serie diaria, el calendar heatmap, la tabla de modelos, los filtros, el tema y el formato actuales. Las consultas SHALL operar en memoria sobre agregados diarios v2.

#### Scenario: Navegación del dashboard v2
- **WHEN** el usuario abre y filtra el dashboard después de la limpieza
- **THEN** ve las mismas vistas y controles compatibles con v2 y obtiene los mismos resultados para el mismo conjunto

### Requirement: Filtros sobre el conjunto local
La capa local SHALL aplicar filtros de máquina, agente, proveedor, modelo y rango de fechas sobre `angel-mac`, `old-mac` y `mac-m5`. Las opciones MUST derivarse del conjunto cargado y todas las vistas MUST compartir la misma semántica de filtro.

#### Scenario: Filtros combinados
- **WHEN** el usuario selecciona una máquina, varios agentes y un rango
- **THEN** todas las vistas muestran únicamente los agregados locales que cumplen la combinación

### Requirement: Error de contrato explícito
La carga MUST validar el conjunto completo antes de consultar y MUST mostrar un error explícito si un fichero incumple v2, sin entregar resultados parciales silenciosos.

#### Scenario: Snapshot inválido durante la carga
- **WHEN** un fichero del checkout no cumple el contrato v2
- **THEN** la capa de datos falla explícitamente y no construye vistas con un subconjunto
