## ADDED Requirements

### Requirement: Propiedad exclusiva por máquina
El publicador SHALL aceptar únicamente las identidades activas `angel-mac` y `aon-mac-m5`, y cada identidad MUST crear o modificar ficheros solo dentro de `snapshots/<machine>/`. La identidad histórica `aon-mac` MUST rechazarse antes de generación o Git. Una ejecución MUST abortar antes del commit si detecta cambios propios fuera de la carpeta asignada, aunque la validación del conjunto MUST seguir aceptando snapshots históricos de `aon-mac`.

#### Scenario: Escritura de angel-mac
- **WHEN** el publicador se ejecuta con identidad `angel-mac`
- **THEN** solo puede añadir o modificar ficheros bajo `snapshots/angel-mac/`

#### Scenario: Cambio fuera de la carpeta propia
- **WHEN** la ejecución de `aon-mac-m5` produce un diff bajo `snapshots/angel-mac/`, `snapshots/aon-mac/` o fuera de `snapshots/aon-mac-m5/`
- **THEN** aborta sin crear commit

#### Scenario: Publicación con identidad histórica
- **WHEN** la preflight recibe `aon-mac`
- **THEN** aborta antes de recuperar commits, generar snapshots o modificar el árbol Git

### Requirement: Generación diaria y reconstrucción automática
Cada ejecución de una identidad activa SHALL descubrir todo el histórico aún disponible en sus fuentes locales, crear cualquier día ausente de su máquina y regenerar el día UTC abierto. Los días cerrados ya válidos MUST permanecer inmutables salvo una operación explícita de reparación. La generación MUST deduplicar registros en memoria antes de agregar. `aon-mac` MUST quedar excluida de esta operación porque sus snapshots agregados ya importados constituyen su histórico completo disponible.

#### Scenario: Primera ejecución con histórico
- **WHEN** no existen snapshots y las fuentes contienen varios días de actividad
- **THEN** se crea un snapshot válido por cada fecha disponible

#### Scenario: Día intermedio ausente
- **WHEN** existe actividad fuente para una fecha que falta entre snapshots ya publicados
- **THEN** la siguiente ejecución reconstruye automáticamente ese día sin reescribir los días cerrados presentes

#### Scenario: Ejecución repetida sin cambios
- **WHEN** no hay nueva actividad, cuotas ni días ausentes
- **THEN** la ejecución valida el estado y termina sin crear un commit vacío

### Requirement: Validación local previa al commit
El publicador MUST ejecutar el esquema, las invariantes y las comprobaciones de privacidad sobre todos los ficheros que vaya a escribir y sobre el conjunto local antes de crear un commit. Un fallo MUST dejar los datos inválidos fuera del historial Git.

#### Scenario: Snapshot inválido
- **WHEN** una fila contiene un contador negativo o una propiedad prohibida
- **THEN** el publicador termina con error y no crea commit

#### Scenario: Conjunto válido
- **WHEN** todos los snapshots cumplen esquema e invariantes
- **THEN** el publicador puede continuar a la fase de commit

### Requirement: Publicación directa y segura en master
El checkout operativo SHALL estar en `master` y usar las credenciales Git personales ya configuradas. Antes de generar, el publicador MUST recuperar cualquier commit pendiente y ejecutar `git pull --rebase origin master`; después de validar MUST crear un commit solo si existe diff e intentar `git push origin master`. El flujo MUST NOT hacer force-push, reset destructivo ni descartar commits creados.

#### Scenario: Publicación sin competencia
- **WHEN** el remoto está actualizado y la generación produce cambios válidos
- **THEN** se crea un commit de snapshots y se publica como avance fast-forward de `master`

#### Scenario: Commit pendiente de una ejecución anterior
- **WHEN** el checkout contiene un commit propio no publicado
- **THEN** la siguiente ejecución intenta rebasarlo y publicarlo antes de crear un nuevo commit

### Requirement: Concurrencia y reintentos limitados
Ante un rechazo no fast-forward, el publicador SHALL ejecutar un número limitado y configurable en código de ciclos `git pull --rebase origin master` y `git push origin master`. Un conflicto de rebase MUST detener la automatización para intervención; el publicador MUST conservar el commit y MUST NOT resolver el conflicto sobrescribiendo la carpeta ajena.

#### Scenario: Las dos publicadoras activas publican a la vez
- **WHEN** `angel-mac` o `aon-mac-m5` recibe rechazo porque la otra publicó primero en su propia carpeta
- **THEN** rebasa su commit y vuelve a intentar el push dentro del límite

#### Scenario: Reintentos agotados
- **WHEN** la red o la competencia impiden publicar tras el límite
- **THEN** la ejecución termina con error y conserva el commit local para la siguiente ejecución

### Requirement: Ejecución diaria mediante launchd
El proyecto SHALL proporcionar configuración e instalación para un job diario de `launchd` únicamente para `angel-mac` y `aon-mac-m5`. El job MUST usar un checkout o worktree operativo dedicado en `master`, PATH y directorio de trabajo explícitos, y logs locales; el plist MUST NOT contener credenciales. El instalador MUST rechazar `aon-mac` y cualquier identidad desconocida antes de crear o cargar un plist.

#### Scenario: Instalación en una máquina permitida
- **WHEN** se instala el job para `angel-mac` con un checkout operativo válido
- **THEN** `launchd` queda configurado para ejecutar diariamente el publicador con esa identidad

#### Scenario: Identidad no permitida
- **WHEN** se intenta instalar el job con `aon-mac` u otra identidad no activa
- **THEN** la instalación falla sin crear ni cargar el plist

### Requirement: Validación completa en CI
CI SHALL validar todos los ficheros bajo `snapshots/` y ejecutar las pruebas y builds aplicables del monorepo en cada actualización relevante. CI MUST fallar ante esquema inválido, fuga de privacidad, invariante rota o fallo de tests/build y MUST NOT modificar snapshots automáticamente.

#### Scenario: Snapshot ajeno inválido
- **WHEN** un cambio válido de `angel-mac` convive con un snapshot inválido ya presente de `aon-mac` o `aon-mac-m5`
- **THEN** la validación completa de CI falla

#### Scenario: Conjunto y aplicación válidos
- **WHEN** todos los snapshots, pruebas y builds aplicables son correctos
- **THEN** CI informa éxito sin generar commits correctivos
