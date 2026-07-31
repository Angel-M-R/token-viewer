## ADDED Requirements

### Requirement: Propiedad exclusiva por máquina
El publicador SHALL aceptar únicamente las identidades activas `angel-mac` y `mac-m5`, y cada identidad MUST crear o modificar ficheros solo dentro de `snapshots/<machine>/`. La identidad histórica `old-mac` MUST rechazarse antes de generación o Git. Una ejecución MUST abortar antes del commit si detecta cambios propios fuera de la carpeta asignada, aunque la validación del conjunto MUST seguir aceptando snapshots históricos de `old-mac`.

#### Scenario: Escritura de angel-mac
- **WHEN** el publicador se ejecuta con identidad `angel-mac`
- **THEN** solo puede añadir o modificar ficheros bajo `snapshots/angel-mac/`

#### Scenario: Cambio fuera de la carpeta propia
- **WHEN** la ejecución de `mac-m5` produce un diff bajo `snapshots/angel-mac/`, `snapshots/old-mac/` o fuera de `snapshots/mac-m5/`
- **THEN** aborta sin crear commit

#### Scenario: Publicación con identidad histórica
- **WHEN** la preflight recibe `old-mac`
- **THEN** aborta antes de recuperar commits, generar snapshots o modificar el árbol Git

### Requirement: Generación diaria y reconstrucción automática
Cada ejecución de una identidad activa SHALL descubrir todo el histórico aún disponible en sus fuentes locales, crear cualquier día ausente de su máquina y regenerar el día local `Europe/Madrid` abierto. Los días cerrados ya válidos MUST permanecer inmutables salvo una operación explícita de reparación. La generación MUST deduplicar registros en memoria antes de agregar. `old-mac` MUST quedar excluida de esta operación porque sus snapshots agregados ya importados constituyen su histórico completo disponible.

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
El publicador MUST ejecutar el esquema v2, las invariantes y las comprobaciones de privacidad sobre todos los ficheros que vaya a escribir y sobre el conjunto local antes de crear un commit. Un fallo MUST dejar los datos inválidos fuera del historial Git.

#### Scenario: Snapshot inválido
- **WHEN** una fila contiene un contador negativo, una propiedad prohibida o `schemaVersion` distinto de 2
- **THEN** el publicador termina con error y no crea commit

#### Scenario: Conjunto válido
- **WHEN** todos los snapshots cumplen esquema v2 e invariantes
- **THEN** el publicador puede continuar a la fase de commit

### Requirement: Repositorio público con control por permisos
La preflight del publicador MUST verificar que el remoto es el esperado y que la rama es `master`, y MUST NOT exigir una visibilidad privada o pública concreta. La restricción de quién puede escribir en `master` SHALL implementarse mediante permisos de colaborador y, una vez público, protección de rama, no mediante comprobaciones de visibilidad del publicador. La apertura pública por sí sola MUST NOT considerarse una concesión de push a cuentas sin permiso.

#### Scenario: Remoto esperado independiente de la visibilidad
- **WHEN** el publicador se ejecuta contra el remoto configurado en la rama `master`, antes o después del cambio de visibilidad
- **THEN** la preflight lo acepta sin comprobar la visibilidad del repositorio

#### Scenario: Remoto inesperado
- **WHEN** el checkout operativo apunta a un remoto distinto del configurado
- **THEN** la preflight aborta antes de generar o modificar el árbol Git

### Requirement: Publicación directa y segura en master
El checkout operativo SHALL estar en `master` y usar las credenciales Git personales ya configuradas. Antes de generar, el publicador MUST recuperar cualquier commit pendiente y ejecutar `git pull --rebase origin master`; después de validar MUST crear un commit solo si existe diff e intentar `git push origin master`. El flujo MUST NOT hacer force-push, reset destructivo ni descartar commits creados. Esta prohibición de force-push MUST ser absoluta e independiente de cualquier reescritura de historial manual y puntual realizada fuera de la automatización.

#### Scenario: Publicación sin competencia
- **WHEN** el remoto está actualizado y la generación produce cambios válidos
- **THEN** se crea un commit de snapshots y se publica como avance fast-forward de `master`

#### Scenario: Commit pendiente de una ejecución anterior
- **WHEN** el checkout contiene un commit propio no publicado
- **THEN** la siguiente ejecución intenta rebasarlo y publicarlo antes de crear un nuevo commit

### Requirement: Concurrencia y reintentos limitados
Ante un rechazo no fast-forward, el publicador SHALL ejecutar un número limitado y configurable en código de ciclos `git pull --rebase origin master` y `git push origin master`. Un conflicto de rebase MUST detener la automatización para intervención; el publicador MUST conservar el commit y MUST NOT resolver el conflicto sobrescribiendo la carpeta ajena.

#### Scenario: Las dos publicadoras activas publican a la vez
- **WHEN** `angel-mac` o `mac-m5` recibe rechazo porque la otra publicó primero en su propia carpeta
- **THEN** rebasa su commit y vuelve a intentar el push dentro del límite

#### Scenario: Reintentos agotados
- **WHEN** la red o la competencia impiden publicar tras el límite
- **THEN** la ejecución termina con error y conserva el commit local para la siguiente ejecución

### Requirement: Ejecución diaria mediante launchd
El proyecto SHALL proporcionar configuración e instalación para un job diario de `launchd` únicamente para `angel-mac` y `mac-m5`. El job MUST usar un checkout o worktree operativo dedicado en `master`, PATH y directorio de trabajo explícitos, y logs locales; el plist MUST NOT contener credenciales. El job MUST reconstruir los artefactos compilados de los que depende el collector después de cada `git pull --rebase` y antes de generar, de modo que `dist/` nunca quede obsoleto respecto al código publicado. El instalador MUST rechazar `old-mac` y cualquier identidad desconocida antes de crear o cargar un plist.

#### Scenario: Instalación en una máquina permitida
- **WHEN** se instala el job para `angel-mac` con un checkout operativo válido
- **THEN** `launchd` queda configurado para ejecutar diariamente el publicador con esa identidad

#### Scenario: Identidad no permitida
- **WHEN** se intenta instalar el job con `old-mac` u otra identidad no activa
- **THEN** la instalación falla sin crear ni cargar el plist

### Requirement: Validación completa en CI
CI SHALL validar todos los ficheros bajo `snapshots/` contra el esquema v2, ejecutar las pruebas y builds aplicables del monorepo y escanear el árbol Git versionado completo contra los literales exactos pre-anonimización y la cadena del antiguo empleador en cada actualización relevante. CI MUST fallar ante esquema inválido, versión distinta de 2, fuga de privacidad, invariante rota, literal prohibido o fallo de tests/build, y MUST NOT modificar snapshots automáticamente. El check literal MUST incluir cambios OpenSpec activos e históricos, informes y cualquier otro fichero versionado sin exclusiones; MUST preservar `angel-mac`; y MUST NOT sustituir la validación del esquema cerrado para privacidad de payloads.

#### Scenario: Snapshot ajeno inválido
- **WHEN** un cambio válido de `angel-mac` convive con un snapshot inválido ya presente de `old-mac` o `mac-m5`
- **THEN** la validación completa de CI falla

#### Scenario: Snapshot con esquema antiguo
- **WHEN** cualquier fichero bajo `snapshots/` declara `schemaVersion = 1`
- **THEN** la validación completa de CI falla

#### Scenario: Conjunto y aplicación válidos
- **WHEN** todos los snapshots, pruebas y builds aplicables son correctos y el árbol Git completo no contiene literales prohibidos
- **THEN** CI informa éxito sin generar commits correctivos

#### Scenario: Literal prohibido fuera de snapshots
- **WHEN** un cambio OpenSpec, informe, doc, fichero de código o test contiene una identidad pre-anonimización o la cadena del antiguo empleador
- **THEN** CI falla aunque todos los snapshots validen contra el esquema v2
