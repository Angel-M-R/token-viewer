# machine-registry Specification

## Purpose
TBD - created by archiving change fase-2-servidor-central. Update Purpose after archive.
## Requirements
### Requirement: Identidades fijas y propiedad de carpeta
TokenViewer SHALL reconocer `angel-mac`, `old-mac` y `mac-m5` como identidades de snapshot. `angel-mac` y `mac-m5` MUST ser las únicas publicadoras activas; `old-mac` MUST ser histórica. Una identidad activa MUST escribir únicamente en `snapshots/<machine>/` y no SHALL existir registro dinámico ni token de máquina.

#### Scenario: Identidad histórica válida para lectura
- **WHEN** el validador o dashboard carga `snapshots/old-mac/`
- **THEN** acepta su histórico sin habilitar generación o publicación

#### Scenario: Propiedad de carpeta activa
- **WHEN** `mac-m5` genera o publica
- **THEN** solo puede modificar `snapshots/mac-m5/`
