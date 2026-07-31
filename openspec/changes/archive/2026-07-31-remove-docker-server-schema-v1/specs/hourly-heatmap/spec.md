## REMOVED Requirements

### Requirement: Heatmap 7×24 por métrica activa
**Reason**: El contrato v2 publica agregados diarios y el dashboard actual usa únicamente calendar heatmap.
**Migration**: Usar el calendar heatmap anual definido en `local-snapshot-dashboard`.

#### Scenario: Dashboard diario
- **WHEN** el usuario recorre las vistas
- **THEN** no existe una matriz horaria 7×24

### Requirement: Horas en la zona horaria local del navegador
**Reason**: Los snapshots ya declaran su fecha local y no contienen horas.
**Migration**: Consultar directamente la fecha diaria sin conversión horaria.

#### Scenario: Sin conversión de zona
- **WHEN** se calcula el calendar heatmap
- **THEN** usa la fecha del snapshot sin parámetro de zona horaria

### Requirement: Leyenda de escala y tooltip por celda
**Reason**: Las celdas horarias dejan de existir.
**Migration**: Mantener leyenda y tooltip diarios en el calendar heatmap.

#### Scenario: Tooltip diario
- **WHEN** el usuario inspecciona un día del calendario
- **THEN** ve fecha y métricas diarias sin franja horaria

### Requirement: Calendar heatmap anual
**Reason**: La vista permanece activa pero su contrato se traslada a `local-snapshot-dashboard` para no conservar una capability horaria.
**Migration**: Aplicar el requisito de paridad visible y consultas diarias de `local-snapshot-dashboard`.

#### Scenario: Calendar heatmap conservado
- **WHEN** el usuario abre el dashboard después de la limpieza
- **THEN** el calendar heatmap anual continúa visible y funcional
