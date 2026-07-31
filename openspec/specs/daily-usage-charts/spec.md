# daily-usage-charts Specification

## Purpose
TBD - created by archiving change fase-3-dashboard-web. Update Purpose after archive.
## Requirements
### Requirement: Barras apiladas por día
La vista principal SHALL renderizar una gráfica de barras apiladas por día alimentada por la consulta local de snapshots v2 con los filtros aplicados, donde cada segmento corresponde al `groupBy` activo.

#### Scenario: Renderizado de la serie diaria
- **WHEN** el rango contiene datos de varios agentes
- **THEN** la gráfica muestra una barra por día apilada por agente

#### Scenario: Tooltip por día
- **WHEN** el usuario pasa el cursor sobre una barra
- **THEN** el tooltip muestra fecha, segmentos y total

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
La gráfica SHALL superponer una media móvil de 7 días calculada en el cliente desde la serie diaria local.

#### Scenario: Línea de media móvil
- **WHEN** la gráfica muestra al menos siete días
- **THEN** la línea se calcula y actualiza con la magnitud activa

#### Scenario: Rango menor de 7 días
- **WHEN** el rango contiene menos de siete días
- **THEN** usa la ventana disponible sin huecos ni errores
