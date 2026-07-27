## ADDED Requirements

### Requirement: Carga local sin backend
El dashboard SHALL descubrir y cargar los snapshots versionados directamente desde el checkout local mediante el build o servidor de desarrollo estático. La ejecución MUST NOT requerir backend HTTP, SQLite, Docker, Bearer token ni hosting público.

#### Scenario: Arranque local con snapshots
- **WHEN** el usuario inicia el dashboard local desde un checkout con snapshots válidos
- **THEN** las vistas cargan datos sin realizar peticiones a `/api/v1/*`

#### Scenario: Snapshot inválido durante la carga
- **WHEN** el conjunto local no cumple el contrato
- **THEN** la capa de datos muestra un error explícito y no entrega agregados parciales silenciosamente

### Requirement: Filtros globales sobre snapshots
La capa local SHALL aplicar los filtros actuales de máquina, agente, proveedor, modelo y rango temporal sobre las filas horarias de `angel-mac`, `old-mac` y `mac-m5`. Los valores disponibles de cada filtro MUST derivarse del conjunto cargado y las combinaciones de filtros MUST tener la misma semántica inclusiva que el dashboard actual. La identidad histórica `old-mac` MUST permanecer consultable aunque no pueda publicar.

#### Scenario: Filtros combinados
- **WHEN** el usuario selecciona `angel-mac`, dos agentes y un rango de fechas
- **THEN** todas las vistas incluyen únicamente filas de esa máquina, esos agentes y ese rango

#### Scenario: Cambio de filtro global
- **WHEN** el usuario modifica un filtro
- **THEN** resumen, series, heatmaps, modelos y cuotas aplicables se actualizan desde el mismo conjunto filtrado

#### Scenario: Consulta de la máquina retirada
- **WHEN** el usuario filtra por `old-mac`
- **THEN** todas las vistas muestran su histórico agregado ya importado sin exigir fuentes locales ni actividad futura

### Requirement: Paridad de vistas agregadas
El dashboard SHALL conservar las vistas actuales de resumen, serie diaria, heatmap calendario, heatmap horario, desglose por modelos y cuotas. Solicitudes, cinco categorías de tokens, costes estimados, costes facturados, solicitudes sin precio y modelos distintos MUST calcularse a partir de los agregados horarios sin inventar datos individuales.

#### Scenario: Resumen de un rango
- **WHEN** el rango contiene varias filas horarias y modelos
- **THEN** el resumen muestra las sumas de solicitudes, tokens y costes, el recuento sin precio y los modelos distintos

#### Scenario: Desglose por modelo
- **WHEN** el usuario abre la vista de modelos con filtros activos
- **THEN** cada fila combina los agregados del proveedor y modelo correspondientes y el conjunto cubre todo el rango filtrado

### Requirement: Agregación temporal y zona horaria
La serie diaria SHALL agrupar por fecha y el heatmap horario SHALL transformar las horas UTC almacenadas a la zona IANA seleccionada antes de acumular por día de semana y hora. Una zona inválida MUST producir un error controlado y la precisión MUST limitarse explícitamente a la granularidad horaria del contrato.

#### Scenario: Conversión a Europe/Madrid
- **WHEN** una fila horaria UTC corresponde al día siguiente en `Europe/Madrid`
- **THEN** el heatmap la acumula en el día de semana y hora local resultantes

#### Scenario: Zona inválida
- **WHEN** se solicita una zona IANA inexistente
- **THEN** la capa local rechaza la consulta sin romper el resto del dashboard

### Requirement: Cuotas sin identidad de cuenta
Las cards de cuota SHALL mostrar por máquina y proveedor el porcentaje más reciente, plan, renovación y evolución histórica dentro del rango filtrado. El dashboard MUST NOT reconstruir, solicitar ni mostrar login, identidad de cuenta o payload original.

#### Scenario: Cuotas de múltiples identidades
- **WHEN** dos o más identidades tienen muestras de Copilot en el rango
- **THEN** el dashboard muestra sus estados e históricos diferenciados por máquina y proveedor, sin login

#### Scenario: Sin cuotas en el rango
- **WHEN** el rango filtrado no contiene muestras de cuota
- **THEN** las cards de cuota se omiten y el resto de vistas sigue operativo

### Requirement: Ausencia de drill-down individual
El dashboard MUST NOT ofrecer ni reconstruir una lista o drill-down de registros individuales a partir de los snapshots. Cualquier ruta o control anterior de registros MUST retirarse o quedar inaccesible tras el corte.

#### Scenario: Navegación del dashboard migrado
- **WHEN** el usuario recorre todas las vistas disponibles
- **THEN** ninguna expone prompts, sesiones, proyectos, rutas, hashes ni solicitudes individuales
