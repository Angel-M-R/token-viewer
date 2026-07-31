## ADDED Requirements

### Requirement: Identidades fijas, ciclo de vida y propiedad de carpeta
TokenViewer SHALL reconocer exclusivamente `angel-mac`, `old-mac` y `mac-m5` como identidades de snapshot. `angel-mac` y `mac-m5` MUST ser las únicas identidades publicadoras activas; `old-mac` MUST ser histórica y de solo lectura. Una identidad activa configurada localmente MUST autorizar escritura únicamente en `snapshots/<machine>/`; no se creará un registro dinámico, token de máquina ni secreto compartido.

#### Scenario: Identidad publicadora permitida
- **WHEN** el collector se configura como `mac-m5`
- **THEN** acepta la identidad y limita todas sus escrituras a `snapshots/mac-m5/`

#### Scenario: Identidad histórica válida para lectura
- **WHEN** el validador o dashboard carga snapshots bajo `snapshots/old-mac/`
- **THEN** acepta la identidad y expone su histórico sin habilitar generación, publicación ni instalación de `launchd`

#### Scenario: Identidad histórica rechazada para publicación
- **WHEN** el collector, publicador o instalador de `launchd` recibe `old-mac` como identidad operativa
- **THEN** falla antes de escanear, modificar snapshots, crear commits o instalar un job

#### Scenario: Identidad desconocida
- **WHEN** se configura un nombre distinto
- **THEN** la validación falla antes de escanear o modificar snapshots

## REMOVED Requirements

### Requirement: Alta de máquina con emisión de token
**Reason**: No existe servidor central y el alcance fija tres identidades con ciclo de vida explícito.
**Migration**: Reemplazar el alta por configuración local de una identidad publicadora activa y credenciales Git personales externas; conservar `old-mac` solo como identidad histórica de snapshots.

#### Scenario: Sin endpoint de alta
- **WHEN** finaliza el corte
- **THEN** `POST /api/v1/machines/register` y la emisión de tokens dejan de existir

### Requirement: Autenticación de colectores por token de máquina
**Reason**: Los collectors no llaman a endpoints y Git usa las credenciales personales existentes.
**Migration**: Validar identidad activa y propiedad de carpeta localmente; no trasladar `machineToken` a los snapshots ni al plist.

#### Scenario: Publicación autenticada por Git
- **WHEN** una máquina publica su commit
- **THEN** Git usa sus credenciales personales sin Bearer de TokenViewer

### Requirement: Listado de máquinas con actividad
**Reason**: No hay registro de servidor ni API administrativa.
**Migration**: Derivar las identidades y su actividad de las tres carpetas de snapshots en la capa local del dashboard, sin inferir que una identidad con histórico puede publicar.

#### Scenario: Actividad local
- **WHEN** el dashboard necesita máquinas disponibles
- **THEN** las deriva de snapshots válidos sin consultar `/api/v1/machines`
