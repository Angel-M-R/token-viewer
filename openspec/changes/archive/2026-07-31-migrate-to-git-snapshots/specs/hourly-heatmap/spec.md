## REMOVED Requirements

### Requirement: Heatmap 7×24 por métrica activa
**Reason**: El contrato de snapshots v2 agrega el uso por día local `Europe/Madrid` y no publica ningún desglose horario, por lo que la matriz 7 filas × 24 columnas deja de tener datos que representar. Además desaparece el endpoint `GET /api/v1/stats/heatmap` junto con el backend HTTP.
**Migration**: Usar el calendar heatmap anual sobre agregados diarios definido en `local-snapshot-dashboard` (requisito "Calendar heatmap anual sobre agregados diarios"). No existe sustituto con granularidad horaria: esa precisión se pierde de forma deliberada e irreversible en el corte.

### Requirement: Horas en la zona horaria local del navegador
**Reason**: Sin desglose horario no hay nada que convertir por hora. La fecha de cada snapshot ya viene declarada como día local `Europe/Madrid` desde el collector, de modo que el dashboard no realiza ninguna conversión de zona ni envía parámetro `tz`.
**Migration**: Consumir la fecha declarada de cada snapshot tal cual, según el requisito "Agregación temporal diaria" de `local-snapshot-dashboard`. Cualquier llamada que enviara `tz` desaparece con el backend.

### Requirement: Leyenda de escala y tooltip por celda
**Reason**: La leyenda y el tooltip descritos aquí están acoplados a la celda día/hora del heatmap 7×24, que se retira. El tooltip por franja horaria no puede construirse a partir de agregados diarios.
**Migration**: La escala de color y el tooltip pasan a definirse por día en el calendar heatmap anual de `local-snapshot-dashboard`, sin franja horaria.

### Requirement: Calendar heatmap anual
**Reason**: La vista sigue existiendo, pero deja de pertenecer a esta capability: ya no es un complemento del heatmap horario, sino la única vista de intensidad y se alimenta directamente de los agregados diarios locales.
**Migration**: El comportamiento se traslada sin pérdida a `local-snapshot-dashboard`, requisito "Calendar heatmap anual sobre agregados diarios". No se requiere ninguna acción del usuario: la vista se conserva.
