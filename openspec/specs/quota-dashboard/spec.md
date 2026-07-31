# quota-dashboard Specification

## Purpose
TBD - created by archiving change fase-4-copilot-cuotas. Update Purpose after archive.
## Requirements
### Requirement: Card de Copilot en el resumen
El dashboard SHALL mostrar una card de cuota de Copilot por cada máquina con muestras en el periodo filtrado. Cada card MUST mostrar máquina, gauge del porcentaje más reciente, días hasta renovación y plan; MUST NOT mostrar ni requerir login. Sin muestras, la card MUST NOT mostrarse.

#### Scenario: Máquina con datos
- **WHEN** el periodo contiene muestras de una máquina
- **THEN** el resumen muestra su card con los valores actuales y sin login

#### Scenario: Sin datos de Copilot
- **WHEN** el periodo no contiene muestras
- **THEN** no se muestra ninguna card y el resto del dashboard no cambia

### Requirement: Deduplicación por cuenta en la visualización
La visualización SHALL agrupar por máquina y proveedor, no por cuenta. Muestras equivalentes de la misma máquina, proveedor y fecha MUST mostrarse una vez y las máquinas distintas MUST permanecer separadas.

#### Scenario: Identidades distintas
- **WHEN** varias identidades tienen muestras de Copilot
- **THEN** se muestra una card por identidad con datos, sin identidad de cuenta

### Requirement: Sparkline de evolución del porcentaje
Cada card SHALL incluir una sparkline con la evolución de `percentUsed` de su máquina y proveedor dentro del periodo filtrado, y MUST reaccionar a rango y filtros de máquina igual que las demás vistas.

#### Scenario: Evolución en el periodo
- **WHEN** una máquina tiene varias muestras en el rango
- **THEN** la sparkline dibuja los porcentajes ordenados por fecha

#### Scenario: Un único snapshot en el periodo
- **WHEN** solo existe una muestra
- **THEN** la card muestra el gauge y la sparkline degrada sin errores
