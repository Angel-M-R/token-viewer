## MODIFIED Requirements

### Requirement: Card de Copilot en el resumen
El dashboard SHALL mostrar en la vista de resumen una card de cuota de Copilot por cada máquina con muestras en el periodo filtrado. Cada card MUST mostrar la máquina, un gauge con el `percentUsed` más reciente, los días restantes hasta `resetsAt` y el plan; MUST NOT mostrar ni requerir login o identidad de cuenta. Si no hay muestras en el periodo, la card MUST NOT mostrarse.

#### Scenario: Máquina con datos en el periodo
- **WHEN** el periodo filtrado contiene muestras de Copilot de `angel-mac`
- **THEN** el resumen muestra una card identificada por máquina con gauge, días hasta renovación y plan, sin login

#### Scenario: Sin datos de Copilot
- **WHEN** no existen muestras de Copilot en el periodo
- **THEN** el resumen no muestra cards de Copilot y el resto del dashboard no cambia

#### Scenario: Muestra sin fecha de renovación
- **WHEN** la muestra más reciente no tiene `resetsAt`
- **THEN** la card muestra el gauge y un marcador vacío en los días hasta renovación

### Requirement: Deduplicación por cuenta en la visualización
La visualización de cuota SHALL agrupar por máquina y proveedor, no por cuenta: muestras equivalentes de la misma máquina, proveedor e instante MUST mostrarse una vez, y muestras de máquinas distintas MUST permanecer separadas. El dashboard MUST NOT deducir una cuenta desde otros datos.

#### Scenario: Muestras repetidas de una máquina
- **WHEN** la capa local recibe puntos equivalentes de `angel-mac` y Copilot
- **THEN** muestra una sola card y un solo punto para ese instante

#### Scenario: Identidades distintas
- **WHEN** `angel-mac`, `old-mac` y `mac-m5` tienen muestras de Copilot
- **THEN** el resumen muestra una card por identidad con datos en el periodo, sin identidad de cuenta

### Requirement: Sparkline de evolución del porcentaje
Cada card de Copilot SHALL incluir una sparkline con la evolución de `percentUsed` de su máquina y proveedor a lo largo del periodo filtrado, y MUST reaccionar a los cambios de rango y filtros de máquina igual que el resto de vistas.

#### Scenario: Evolución en el periodo
- **WHEN** una máquina tiene varias muestras en el rango
- **THEN** la sparkline dibuja los porcentajes ordenados por `takenAt`

#### Scenario: Cambio de filtros globales
- **WHEN** el usuario cambia rango o filtro de máquina
- **THEN** sparkline y gauge se actualizan con las muestras del nuevo conjunto

#### Scenario: Un único snapshot en el periodo
- **WHEN** solo existe una muestra en el rango
- **THEN** la card muestra el gauge y la sparkline degrada sin errores
