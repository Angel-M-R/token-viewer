# daily-usage-charts Specification

## Purpose
TBD - created by archiving change fase-3-dashboard-web. Update Purpose after archive.
## Requirements
### Requirement: Barras apiladas por día
La vista principal SHALL renderizar una gráfica de barras apiladas por día alimentada por `GET /api/v1/stats/daily` con los filtros globales aplicados, donde cada segmento de la pila corresponde a un valor del `groupBy` activo.

#### Scenario: Renderizado de la serie diaria
- **WHEN** el usuario selecciona un rango de 30 días con datos de varios agentes
- **THEN** la gráfica muestra una barra por día, apilada por agente, cubriendo el rango seleccionado

#### Scenario: Tooltip por día
- **WHEN** el usuario pasa el cursor sobre una barra
- **THEN** un tooltip muestra la fecha y el valor de cada segmento de la pila con su total

### Requirement: groupBy conmutable
La gráfica diaria SHALL permitir conmutar la dimensión de apilado (`groupBy`) entre agente, modelo y máquina sin perder el resto de filtros.

#### Scenario: Cambio de groupBy
- **WHEN** el usuario cambia el `groupBy` de agente a modelo
- **THEN** la gráfica se recarga con `groupBy=model` y las pilas pasan a segmentarse por modelo, manteniendo el rango de fechas y los demás filtros

### Requirement: Toggle tokens y coste
La gráfica diaria SHALL ofrecer un toggle para alternar la magnitud representada entre tokens y coste (USD).

#### Scenario: Cambio a coste
- **WHEN** el usuario activa el modo coste
- **THEN** las barras y su eje representan USD con 2 decimales en lugar de tokens

### Requirement: Media móvil de 7 días
La gráfica diaria SHALL superponer una línea de media móvil de 7 días de la magnitud activa, calculada en el cliente a partir de la serie diaria ya agregada por el servidor.

#### Scenario: Línea de media móvil
- **WHEN** la gráfica muestra al menos 7 días de datos
- **THEN** una línea de media móvil de 7 días se dibuja superpuesta a las barras y se actualiza al cambiar el toggle tokens/coste

#### Scenario: Rango menor de 7 días
- **WHEN** el rango seleccionado tiene menos de 7 días
- **THEN** la media móvil se calcula con la ventana disponible en cada punto sin producir huecos ni errores

