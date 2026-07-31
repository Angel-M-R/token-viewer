# models-breakdown Specification

## Purpose
TBD - created by archiving change fase-3-dashboard-web. Update Purpose after archive.
## Requirements
### Requirement: Tabla de desglose por modelo
El dashboard SHALL mostrar una tabla alimentada por consultas locales sobre snapshots v2, con una fila por modelo y columnas para tokens, coste, solicitudes y porcentaje del total filtrado.

#### Scenario: Carga de la tabla
- **WHEN** el rango contiene varios modelos
- **THEN** la tabla muestra una fila agregada por modelo con sus métricas

#### Scenario: Porcentaje del total
- **WHEN** un modelo representa una cuarta parte del coste filtrado
- **THEN** su porcentaje muestra 25 %

### Requirement: Ordenación por columnas
La tabla de modelos SHALL ser ordenable por cualquiera de sus columnas numéricas, alternando entre orden ascendente y descendente al pulsar la cabecera.

#### Scenario: Ordenar por coste
- **WHEN** el usuario pulsa la cabecera de la columna de coste
- **THEN** las filas se reordenan por coste descendente, y un segundo clic invierte el orden

### Requirement: Badge de proveedor coloreado
Cada fila SHALL mostrar un badge del proveedor del modelo con un color consistente por proveedor (mapeo proveedor→color compartido con las series de los charts).

#### Scenario: Colores consistentes por proveedor
- **WHEN** la tabla lista dos modelos del mismo proveedor y uno de otro proveedor
- **THEN** los dos primeros muestran un badge del mismo color y el tercero un color distinto, coherente con el color de ese proveedor en el resto del dashboard
