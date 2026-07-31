## MODIFIED Requirements

### Requirement: Cards de resumen del periodo
La vista de resumen SHALL mostrar desde las consultas locales v2 y con los filtros aplicados cards de tokens totales, coste estimado, solicitudes y máquinas activas.

#### Scenario: Carga del resumen
- **WHEN** el usuario abre el dashboard con un rango seleccionado
- **THEN** se muestran las cuatro cards con los totales calculados del conjunto local

#### Scenario: Periodo sin datos
- **WHEN** los filtros no seleccionan datos
- **THEN** las cards muestran cero y un estado vacío claro sin errores
