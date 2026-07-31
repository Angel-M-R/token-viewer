## MODIFIED Requirements

### Requirement: Tabla de desglose por modelo
El dashboard SHALL mostrar una tabla alimentada por consultas locales sobre snapshots v2, con una fila por modelo y columnas para tokens, coste, solicitudes y porcentaje del total filtrado.

#### Scenario: Carga de la tabla
- **WHEN** el rango contiene varios modelos
- **THEN** la tabla muestra una fila agregada por modelo con sus métricas

#### Scenario: Porcentaje del total
- **WHEN** un modelo representa una cuarta parte del coste filtrado
- **THEN** su porcentaje muestra 25 %
