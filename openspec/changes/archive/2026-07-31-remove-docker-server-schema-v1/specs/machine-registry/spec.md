## ADDED Requirements

### Requirement: Identidades fijas y propiedad de carpeta
TokenViewer SHALL reconocer `angel-mac`, `old-mac` y `mac-m5` como identidades de snapshot. `angel-mac` y `mac-m5` MUST ser las únicas publicadoras activas; `old-mac` MUST ser histórica. Una identidad activa MUST escribir únicamente en `snapshots/<machine>/` y no SHALL existir registro dinámico ni token de máquina.

#### Scenario: Identidad histórica válida para lectura
- **WHEN** el validador o dashboard carga `snapshots/old-mac/`
- **THEN** acepta su histórico sin habilitar generación o publicación

#### Scenario: Propiedad de carpeta activa
- **WHEN** `mac-m5` genera o publica
- **THEN** solo puede modificar `snapshots/mac-m5/`

## REMOVED Requirements

### Requirement: Alta de máquina con emisión de token
**Reason**: No existe servidor central y las identidades son fijas.
**Migration**: Configurar localmente una identidad activa y usar credenciales Git externas.

#### Scenario: Sin alta remota
- **WHEN** se prepara una identidad activa
- **THEN** no se llama a un endpoint ni se emite un token de TokenViewer

### Requirement: Autenticación de colectores por token de máquina
**Reason**: Los collectors no llaman a endpoints de TokenViewer.
**Migration**: Validar localmente identidad y propiedad de carpeta.

#### Scenario: Publicación Git
- **WHEN** una máquina publica su snapshot
- **THEN** Git usa credenciales externas sin Bearer de TokenViewer

### Requirement: Listado de máquinas con actividad
**Reason**: No existe registro ni API administrativa.
**Migration**: Derivar identidades y actividad de snapshots válidos.

#### Scenario: Actividad local
- **WHEN** el dashboard necesita las máquinas disponibles
- **THEN** las deriva del conjunto local sin consultar una API
