## MODIFIED Requirements

### Requirement: Barra de filtros globales
El dashboard SHALL mostrar rango de fechas, máquinas, agentes, proveedores, modelos y métrica del calendar heatmap. La barra MUST NOT ofrecer controles de granularidad horaria.

#### Scenario: Un filtro afecta a todas las vistas
- **WHEN** el usuario selecciona un agente
- **THEN** todas las vistas se recalculan sobre ese filtro

### Requirement: Rango de fechas con presets y rango custom
El filtro SHALL ofrecer 7d, 30d, 90d, año, todo y rango custom. Los límites MUST interpretarse como fechas sin componente horario coherentes con los snapshots diarios.

#### Scenario: Rango custom
- **WHEN** el usuario define inicio y fin
- **THEN** todas las vistas usan exactamente ese rango inclusivo

### Requirement: Multiselects poblados desde la API
Los filtros de máquina, agente, proveedor y modelo MUST ser multiselect y sus opciones MUST derivarse dinámicamente de los snapshots v2 cargados, no de listas hardcodeadas ni de una API. `old-mac` MUST permanecer seleccionable como histórico.

#### Scenario: Opciones locales
- **WHEN** el dashboard carga el conjunto válido
- **THEN** las opciones reflejan sus dimensiones e identidades

### Requirement: Métrica activa del heatmap
La barra SHALL incluir tokens, coste y requests como métricas del calendar heatmap diario. El selector MUST NOT controlar una vista horaria.

#### Scenario: Cambio de métrica
- **WHEN** el usuario cambia a coste
- **THEN** el calendar heatmap recalcula intensidad, leyenda y tooltips en USD

### Requirement: Filtros persistidos en los query params de la URL
El estado completo de filtros MUST serializarse en query params para reproducir la misma vista. Los parámetros MUST representar únicamente filtros soportados por el dashboard diario.

#### Scenario: Apertura de una URL con filtros
- **WHEN** se abre una URL con filtros válidos
- **THEN** la barra y las vistas se inicializan con esos valores
