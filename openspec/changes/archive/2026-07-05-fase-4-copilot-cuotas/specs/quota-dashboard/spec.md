## ADDED Requirements

### Requirement: Card de Copilot en el resumen
El dashboard SHALL mostrar en la vista de resumen una card de cuota de Copilot por cada cuenta de GitHub con snapshots en el periodo filtrado. Cada card MUST mostrar: un gauge con el `percent_used` del snapshot más reciente, los días restantes hasta `resets_at`, el plan y el login de la cuenta. Si no hay snapshots en el periodo, la card MUST NOT mostrarse.

#### Scenario: Cuenta con datos en el periodo
- **WHEN** el periodo filtrado contiene snapshots de una cuenta de Copilot
- **THEN** el resumen muestra una card con el gauge del porcentaje más reciente, los días hasta el reset, el plan y el login de la cuenta

#### Scenario: Sin datos de Copilot
- **WHEN** no existen snapshots de Copilot en el periodo filtrado
- **THEN** el resumen no muestra ninguna card de Copilot y el resto del dashboard no cambia

#### Scenario: Snapshot sin fecha de reset
- **WHEN** el snapshot más reciente no tiene `resets_at`
- **THEN** la card muestra el gauge con normalidad y un marcador vacío ("—") en los días hasta reset

### Requirement: Deduplicación por cuenta en la visualización
La visualización de cuota SHALL deduplicar por cuenta de GitHub, no por máquina: si varias máquinas reportan la misma cuenta, el dashboard MUST mostrar una única card para esa cuenta, alimentada por los datos combinados que devuelve la API de lectura.

#### Scenario: Misma cuenta desde dos máquinas
- **WHEN** dos máquinas registradas envían snapshots de la misma cuenta de GitHub
- **THEN** el resumen muestra una sola card de Copilot para esa cuenta, no una por máquina

#### Scenario: Dos cuentas distintas
- **WHEN** hay snapshots de dos cuentas de GitHub distintas en el periodo
- **THEN** el resumen muestra dos cards, una por cuenta, cada una con sus propios datos

### Requirement: Sparkline de evolución del porcentaje
Cada card de Copilot SHALL incluir una sparkline con la evolución de `percent_used` de esa cuenta a lo largo del periodo filtrado por los filtros globales del dashboard, y MUST reaccionar a los cambios del rango temporal igual que el resto de vistas.

#### Scenario: Evolución en el periodo
- **WHEN** la cuenta tiene varios snapshots en el rango temporal filtrado
- **THEN** la sparkline dibuja la serie de porcentajes ordenada por `taken_at` dentro de ese rango

#### Scenario: Cambio de filtros globales
- **WHEN** el usuario cambia el rango temporal de los filtros globales
- **THEN** la sparkline y el gauge se actualizan con los snapshots del nuevo rango

#### Scenario: Un único snapshot en el periodo
- **WHEN** la cuenta solo tiene un snapshot en el rango filtrado
- **THEN** la card muestra el gauge con ese valor y la sparkline degrada con elegancia (punto único o se omite) sin errores
