## ADDED Requirements

### Requirement: Tabla de desglose por modelo
El dashboard SHALL mostrar una tabla alimentada por `GET /api/v1/stats/models` con una fila por modelo y columnas para: tokens por tipo (input, output, cache), coste en USD, número de requests y porcentaje sobre el total del periodo filtrado.

#### Scenario: Carga de la tabla
- **WHEN** el usuario abre el dashboard con datos de varios modelos en el rango activo
- **THEN** la tabla muestra una fila por modelo con tokens por tipo, coste, requests y % del total

#### Scenario: Porcentaje del total
- **WHEN** un modelo acumula 25 USD de un total de 100 USD en el periodo filtrado
- **THEN** su columna de porcentaje muestra 25 %

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
