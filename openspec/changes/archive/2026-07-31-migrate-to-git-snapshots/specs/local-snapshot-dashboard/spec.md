## ADDED Requirements

### Requirement: Carga local sin backend
El dashboard SHALL descubrir y cargar los snapshots versionados v2 directamente desde el checkout local mediante el build o servidor de desarrollo estático. La ejecución MUST NOT requerir backend HTTP, SQLite, Docker, Bearer token ni hosting público de la aplicación.

#### Scenario: Arranque local con snapshots
- **WHEN** el usuario inicia el dashboard local desde un checkout con snapshots v2 válidos
- **THEN** las vistas cargan datos sin realizar peticiones a `/api/v1/*`

#### Scenario: Snapshot inválido durante la carga
- **WHEN** el conjunto local no cumple el contrato v2
- **THEN** la capa de datos muestra un error explícito y no entrega agregados parciales silenciosamente

### Requirement: Filtros globales sobre snapshots
La capa local SHALL aplicar los filtros actuales de máquina, agente, proveedor, modelo y rango temporal sobre las filas diarias de `angel-mac`, `old-mac` y `mac-m5`. Los filtros MUST NOT ofrecer selección por hora ni una métrica activa de heatmap horario. Los valores disponibles de cada filtro MUST derivarse del conjunto cargado y las combinaciones de filtros MUST tener la misma semántica inclusiva que el dashboard actual. La identidad histórica `old-mac` MUST permanecer consultable aunque no pueda publicar.

#### Scenario: Filtros combinados
- **WHEN** el usuario selecciona `angel-mac`, dos agentes y un rango de fechas
- **THEN** todas las vistas incluyen únicamente filas de esa máquina, esos agentes y ese rango

#### Scenario: Cambio de filtro global
- **WHEN** el usuario modifica un filtro
- **THEN** resumen, serie diaria, heatmap calendario, modelos y cuotas aplicables se actualizan desde el mismo conjunto filtrado

#### Scenario: Consulta de la máquina retirada
- **WHEN** el usuario filtra por `old-mac`
- **THEN** todas las vistas muestran su histórico agregado ya importado sin exigir fuentes locales ni actividad futura

### Requirement: Paridad de vistas agregadas
El dashboard SHALL conservar las vistas de resumen, serie diaria, heatmap calendario, desglose por modelos y cuotas. El heatmap horario 7×24 MUST retirarse. Solicitudes, cinco categorías de tokens, costes estimados, costes facturados, solicitudes sin precio y modelos distintos MUST calcularse a partir de los agregados diarios sin inventar datos individuales ni desglose horario.

#### Scenario: Resumen de un rango
- **WHEN** el rango contiene varias filas diarias y modelos
- **THEN** el resumen muestra las sumas de solicitudes, tokens y costes, el recuento sin precio y los modelos distintos

#### Scenario: Desglose por modelo
- **WHEN** el usuario abre la vista de modelos con filtros activos
- **THEN** cada fila combina los agregados del proveedor y modelo correspondientes y el conjunto cubre todo el rango filtrado

#### Scenario: Heatmap horario ausente
- **WHEN** el usuario recorre las vistas del dashboard migrado
- **THEN** no existe ninguna vista, ruta ni control de heatmap 7×24 por hora

### Requirement: Agregación temporal diaria
La serie diaria y el heatmap calendario SHALL agrupar directamente por la fecha declarada de cada snapshot, que ya es el día local `Europe/Madrid`. La capa local MUST NOT realizar ninguna conversión de zona horaria ni aceptar un parámetro de zona, y la precisión MUST limitarse explícitamente a la granularidad diaria del contrato.

#### Scenario: Serie sobre fechas locales
- **WHEN** el rango contiene snapshots de varios días
- **THEN** cada punto de la serie corresponde a la fecha del snapshot sin recalcular la zona

#### Scenario: Calendar heatmap anual
- **WHEN** el usuario visualiza el heatmap calendario
- **THEN** cada recuadro refleja el total diario de la métrica seleccionada para esa fecha local

### Requirement: Calendar heatmap anual sobre agregados diarios
El dashboard SHALL renderizar un calendar heatmap anual estilo GitHub, con un recuadro por día cuya intensidad refleja el valor diario de la métrica activa (tokens, coste o requests) sobre el conjunto filtrado. Esta vista MUST conservarse tras el corte: sustituye al heatmap horario 7×24 como única vista de intensidad. El heatmap SHALL mostrar una escala de color secuencial con leyenda y cada recuadro SHALL ofrecer un tooltip con la fecha local, el valor formateado de la métrica activa y el número de solicitudes. El tooltip MUST NOT exponer franja horaria alguna.

#### Scenario: Renderizado del calendario
- **WHEN** el usuario visualiza la vista de heatmap del dashboard migrado
- **THEN** se muestra un calendario anual con un recuadro por día cuya intensidad refleja el valor diario de la métrica activa

#### Scenario: Día sin actividad
- **WHEN** un día del año no tiene ninguna fila diaria en el conjunto filtrado
- **THEN** su recuadro se muestra con el color de valor cero, distinguible de los días con actividad

#### Scenario: Tooltip de un día
- **WHEN** el usuario pasa el cursor sobre un recuadro del calendario
- **THEN** el tooltip muestra la fecha local, el valor formateado de la métrica activa y el número de solicitudes, sin ninguna franja horaria

#### Scenario: Cambio de métrica activa
- **WHEN** el usuario cambia la métrica activa a requests
- **THEN** la intensidad diaria y la escala de color se recalculan sobre los nuevos valores sin consultar ninguna API

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
