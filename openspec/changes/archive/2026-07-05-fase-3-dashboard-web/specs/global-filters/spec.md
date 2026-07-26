## ADDED Requirements

### Requirement: Barra de filtros globales
El dashboard SHALL mostrar una barra superior de filtros globales que afectan a todas las vistas de la página: rango de fechas, máquina(s), agente(s), modelo(s) y métrica activa para el heatmap.

#### Scenario: Un filtro afecta a todas las vistas
- **WHEN** el usuario selecciona un agente en el multiselect de agentes
- **THEN** las cards de resumen, la gráfica diaria, el heatmap y la tabla de modelos se recargan mostrando solo datos de ese agente

### Requirement: Rango de fechas con presets y rango custom
El filtro de fechas SHALL ofrecer los presets 7d, 30d, 90d, año y todo, además de un selector de rango custom con fechas de inicio y fin explícitas.

#### Scenario: Selección de preset
- **WHEN** el usuario selecciona el preset "30d"
- **THEN** todas las vistas consultan la API con `from`/`to` cubriendo los últimos 30 días

#### Scenario: Rango custom
- **WHEN** el usuario define un rango custom con fechas de inicio y fin
- **THEN** todas las vistas consultan la API con exactamente ese `from`/`to`

### Requirement: Multiselects poblados desde la API
Los filtros de máquina, agente y modelo MUST ser multiselect y sus opciones MUST poblarse dinámicamente desde la API (máquinas desde `GET /api/v1/machines`; agentes y modelos desde los datos agregados), no desde listas hardcodeadas.

#### Scenario: Aparece una máquina nueva
- **WHEN** una máquina nueva registra datos en el servidor y el usuario abre el dashboard
- **THEN** la máquina aparece como opción seleccionable en el multiselect de máquinas sin cambios de código

#### Scenario: Selección múltiple
- **WHEN** el usuario selecciona dos modelos en el multiselect de modelos
- **THEN** las peticiones a `stats/*` incluyen ambos valores como parámetros `model` repetidos y las vistas agregan solo esos modelos

### Requirement: Métrica activa del heatmap
La barra de filtros SHALL incluir un selector de métrica activa para el heatmap con los valores tokens, coste y requests.

#### Scenario: Cambio de métrica
- **WHEN** el usuario cambia la métrica activa de tokens a coste
- **THEN** el heatmap se recarga con `metric=cost` y su leyenda y tooltips reflejan valores en USD

### Requirement: Filtros persistidos en los query params de la URL
El estado completo de los filtros globales MUST serializarse en los query params de la URL, de modo que la URL sea la única fuente de verdad: compartir o bookmarkear la URL MUST reproducir exactamente la misma vista.

#### Scenario: Cambio de filtro actualiza la URL
- **WHEN** el usuario cambia cualquier filtro global
- **THEN** los query params de la URL se actualizan sin recargar la página

#### Scenario: Apertura de una URL con filtros
- **WHEN** un usuario abre una URL del dashboard que contiene filtros en los query params
- **THEN** la barra de filtros y todas las vistas se inicializan con exactamente esos filtros

#### Scenario: Navegación atrás del navegador
- **WHEN** el usuario pulsa el botón atrás del navegador tras cambiar filtros
- **THEN** los filtros y las vistas vuelven al estado codificado en la URL anterior
