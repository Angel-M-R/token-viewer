## MODIFIED Requirements

### Requirement: Barra de filtros globales
El dashboard SHALL mostrar una barra superior de filtros globales que afectan a todas las vistas de la página: rango de fechas, máquina(s), agente(s), proveedor(es), modelo(s) y métrica activa del calendar heatmap diario. La barra MUST NOT ofrecer ningún filtro, control o selector con granularidad horaria.

#### Scenario: Un filtro afecta a todas las vistas
- **WHEN** el usuario selecciona un agente en el multiselect de agentes
- **THEN** las cards de resumen, la gráfica diaria, el calendar heatmap, la tabla de modelos y las cards de cuota se recargan mostrando solo datos de ese agente

#### Scenario: Ausencia de filtrado horario
- **WHEN** el usuario recorre todos los controles de la barra de filtros
- **THEN** no existe ningún control de hora, franja horaria ni zona horaria

### Requirement: Rango de fechas con presets y rango custom
El filtro de fechas SHALL ofrecer los presets 7d, 30d, 90d, año y todo, además de un selector de rango custom con fechas de inicio y fin explícitas. Los límites `from`/`to` MUST interpretarse como fechas locales `Europe/Madrid` sin componente horario, coherentes con la fecha declarada de cada snapshot.

#### Scenario: Selección de preset
- **WHEN** el usuario selecciona el preset "30d"
- **THEN** todas las vistas se recalculan sobre las filas diarias cuyo `date` cae en los últimos 30 días

#### Scenario: Rango custom
- **WHEN** el usuario define un rango custom con fechas de inicio y fin
- **THEN** todas las vistas se recalculan sobre exactamente ese rango de fechas, ambos extremos incluidos

### Requirement: Multiselects poblados desde la API
Los filtros de máquina, agente, proveedor y modelo MUST ser multiselect y sus opciones MUST derivarse dinámicamente del conjunto de snapshots v2 cargado localmente, no de listas hardcodeadas ni de peticiones a `/api/v1/*`. Las máquinas disponibles MUST ser las identidades renombradas `angel-mac`, `old-mac` y `mac-m5`, incluyendo la histórica de solo lectura.

#### Scenario: Aparece una máquina nueva
- **WHEN** el checkout local contiene snapshots de una carpeta de máquina no vista antes
- **THEN** esa máquina aparece como opción seleccionable en el multiselect de máquinas sin cambios de código

#### Scenario: Selección múltiple
- **WHEN** el usuario selecciona dos modelos en el multiselect de modelos
- **THEN** todas las vistas agregan únicamente las filas diarias de esos dos modelos

#### Scenario: Identidad histórica seleccionable
- **WHEN** el usuario abre el multiselect de máquinas
- **THEN** `old-mac` aparece como opción y al seleccionarla las vistas muestran su histórico ya importado

### Requirement: Métrica activa del heatmap
La barra de filtros SHALL incluir un selector de métrica activa con los valores tokens, coste y requests que gobierna la intensidad del calendar heatmap anual diario. Este selector MUST NOT controlar ningún heatmap horario 7×24, que queda retirado.

#### Scenario: Cambio de métrica
- **WHEN** el usuario cambia la métrica activa de tokens a coste
- **THEN** el calendar heatmap anual recalcula la intensidad diaria y su leyenda y tooltips reflejan valores en USD

#### Scenario: Sin heatmap horario asociado
- **WHEN** el usuario cambia la métrica activa
- **THEN** ninguna vista de heatmap por hora se recarga ni existe, y solo se actualiza el calendar heatmap diario

### Requirement: Filtros persistidos en los query params de la URL
El estado completo de los filtros globales MUST serializarse en los query params de la URL, de modo que la URL sea la única fuente de verdad: compartir o bookmarkear la URL MUST reproducir exactamente la misma vista. Los query params MUST NOT incluir hora ni zona horaria.

#### Scenario: Cambio de filtro actualiza la URL
- **WHEN** el usuario cambia cualquier filtro global
- **THEN** los query params de la URL se actualizan sin recargar la página

#### Scenario: Apertura de una URL con filtros
- **WHEN** un usuario abre una URL del dashboard local que contiene filtros en los query params
- **THEN** la barra de filtros y todas las vistas se inicializan con exactamente esos filtros

#### Scenario: Navegación atrás del navegador
- **WHEN** el usuario pulsa el botón atrás del navegador tras cambiar filtros
- **THEN** los filtros y las vistas vuelven al estado codificado en la URL anterior

#### Scenario: URL heredada con parámetros horarios
- **WHEN** se abre una URL antigua que incluye parámetros de hora o de zona horaria
- **THEN** esos parámetros se ignoran y la vista se inicializa con los filtros restantes soportados
