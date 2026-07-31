# quota-snapshots Specification

## Purpose
TBD - created by archiving change fase-4-copilot-cuotas. Update Purpose after archive.
## Requirements
### Requirement: Persistencia histórica sanitizada por máquina
Las muestras de cuota SHALL persistirse dentro del snapshot diario v2 de la máquina y MUST contener solo proveedor, fecha local, porcentaje, plan y renovación. El histórico MUST poder reconstruir su evolución sin login, identidad de cuenta ni payload original.

#### Scenario: Historial de varios días
- **WHEN** una máquina publica muestras en días sucesivos
- **THEN** la capa local puede ordenar la evolución desde sus snapshots diarios

### Requirement: API de lectura de snapshots deduplicada por cuenta
La capa local SHALL leer las cuotas del rango filtrado y agruparlas por máquina y proveedor. Por cada grupo SHALL devolver la muestra más reciente y la serie temporal, deduplicando muestras equivalentes por fecha sin usar ni inferir una cuenta.

#### Scenario: Tres identidades con Copilot
- **WHEN** las tres identidades tienen muestras en el rango
- **THEN** la lectura devuelve un grupo por identidad y proveedor sin login

#### Scenario: Sin snapshots en el periodo
- **WHEN** no hay muestras dentro del rango
- **THEN** la lectura devuelve una lista vacía
