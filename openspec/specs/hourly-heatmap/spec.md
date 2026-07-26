# hourly-heatmap Specification

## Purpose
TBD - created by archiving change fase-3-dashboard-web. Update Purpose after archive.
## Requirements
### Requirement: Heatmap 7×24 por métrica activa
El dashboard SHALL renderizar un heatmap de 7 filas (día de la semana) × 24 columnas (hora) alimentado por `GET /api/v1/stats/heatmap`, cuya intensidad refleja la métrica activa seleccionada en los filtros globales (tokens, coste o requests).

#### Scenario: Renderizado del heatmap
- **WHEN** el usuario abre el dashboard con la métrica activa "tokens"
- **THEN** se muestra la matriz 7×24 con la intensidad de cada celda proporcional a los tokens de esa combinación día/hora

#### Scenario: Cambio de métrica activa
- **WHEN** el usuario cambia la métrica activa a "requests"
- **THEN** el heatmap se recarga con `metric=requests` y la escala de color se recalcula sobre los nuevos valores

### Requirement: Horas en la zona horaria local del navegador
El heatmap MUST agrupar por hora local del navegador: la petición a `stats/heatmap` MUST incluir el parámetro `tz` con la zona horaria IANA del navegador, de modo que la conversión se haga en el servidor.

#### Scenario: Sesión a las 23:00 hora local
- **WHEN** existe una sesión registrada a las 23:00 hora local del navegador (p. ej. 23:00 de Madrid, 22:00 UTC)
- **THEN** su actividad aparece en la celda de las 23:00 del heatmap, no en la de las 21:00 ni en la hora UTC

#### Scenario: Envío de la zona horaria
- **WHEN** el dashboard solicita los datos del heatmap
- **THEN** la petición incluye `tz=<zona IANA del navegador>` (p. ej. `tz=Europe/Madrid`)

### Requirement: Leyenda de escala y tooltip por celda
El heatmap SHALL mostrar una escala de color secuencial con leyenda (visualMap), y cada celda SHALL ofrecer un tooltip con día de la semana, hora, valor de la métrica activa y número de requests.

#### Scenario: Tooltip de una celda
- **WHEN** el usuario pasa el cursor sobre una celda del heatmap
- **THEN** un tooltip muestra el día de la semana, la franja horaria, el valor de la métrica activa formateado y el número de requests

### Requirement: Calendar heatmap anual
Debajo del heatmap horario, el dashboard SHALL renderizar un calendar heatmap anual estilo GitHub con la intensidad diaria de la métrica activa.

#### Scenario: Renderizado del calendario
- **WHEN** el usuario visualiza la vista de heatmap
- **THEN** se muestra un calendario anual con un recuadro por día cuya intensidad refleja el valor diario de la métrica activa

#### Scenario: Día sin actividad
- **WHEN** un día del año no tiene ningún dato
- **THEN** su recuadro se muestra con el color de valor cero, distinguible de los días con actividad

