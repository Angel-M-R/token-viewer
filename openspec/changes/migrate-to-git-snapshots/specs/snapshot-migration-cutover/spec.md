## ADDED Requirements

### Requirement: Desarrollo aislado de master
Todo el desarrollo de la migración SHALL realizarse en una rama nueva y MUST NOT editar directamente `master`. La rama confirmada para el trabajo es `feat/git-snapshot-migration`; la publicación operativa directa a `master` solo se habilitará después de integrar y validar la implementación.

#### Scenario: Trabajo de implementación
- **WHEN** se implementan contrato, collector, dashboard, automatización o retirada
- **THEN** los cambios se realizan en `feat/git-snapshot-migration` o en una rama sucesora explícitamente aprobada, nunca directamente en `master`

### Requirement: Migración de un solo uso del esquema v1 al v2
El proyecto SHALL proporcionar herramientas temporales de migración y equivalencia de un solo uso, siguiendo el patrón existente de `scripts/migration/` (módulos, tests, configuración y scripts de raíz dedicados), que conviertan los snapshots v1 existentes al esquema v2 y demuestren la preservación de totales. La conversión MUST reasignar cada fila horaria a su día local `Europe/Madrid` **antes** de colapsar la hora, MUST recombinar las filas que resulten en la misma clave `agent/provider/model` del mismo día, MUST truncar `takenAt` de cada muestra de cuota a la fecha local y MUST escribir el resultado bajo la ruta de la identidad renombrada. Tras ejecutarla, el conjunto completo MUST validar contra el esquema v2 y ningún fichero v1 MUST permanecer. Una vez retenidos los informes y la evidencia, las herramientas de migración y equivalencia v1→v2, sus tests, su configuración dedicada y sus scripts de raíz MUST eliminarse antes de reescribir el historial.

#### Scenario: Reagregación diaria de los snapshots existentes
- **WHEN** se ejecuta la migración sobre los 310 snapshots v1 presentes
- **THEN** produce snapshots v2 sin campo de hora, con las filas del mismo día y clave combinadas, y el conjunto valida completo

#### Scenario: Orden de conversión
- **WHEN** una fila v1 registra actividad a las 23:30 UTC de una fecha
- **THEN** la migración la asigna al día local `Europe/Madrid` correspondiente antes de descartar la hora

#### Scenario: Fichero v1 residual
- **WHEN** después de la migración queda un fichero que declara `schemaVersion = 1`
- **THEN** la validación del conjunto falla y la apertura del repositorio queda bloqueada

#### Scenario: Retirada de las herramientas temporales
- **WHEN** la migración y la equivalencia v1→v2 han terminado y sus informes y evidencia están retenidos
- **THEN** las herramientas de un solo uso y todo su soporte dedicado se eliminan antes de la reescritura del historial

### Requirement: Renombrado total de identidades
Las identidades pre-anonimización de la Mac legacy retirada y de la nueva Mac M5 SHALL sustituirse respectivamente por `old-mac` y `mac-m5` en todo el repositorio: rutas de snapshots, código, tests, fixtures, documentación, informes, `openspec/specs/`, cambios OpenSpec activos e históricos y cualquier otro fichero versionado. `angel-mac` MUST conservar su nombre actual y MUST NOT anonimizarse. El árbol final MUST preservar con lenguaje neutral que `old-mac` es la Mac legacy retirada y de solo lectura y que `mac-m5` es la nueva publicadora M5, sin conservar los literales pre-anonimización ni la cadena del antiguo empleador.

#### Scenario: Referencias fuera de snapshots
- **WHEN** se revisa el repositorio tras el renombrado
- **THEN** ningún fichero versionado contiene una identidad pre-anonimización ni la cadena del antiguo empleador

#### Scenario: Archivo de OpenSpec
- **WHEN** se revisa `openspec/changes/archive/`
- **THEN** sus referencias a identidades usan también los nombres renombrados

#### Scenario: Check del árbol final completo
- **WHEN** CI ejecuta el check focalizado de literales prohibidos
- **THEN** recorre todo el árbol Git versionado sin excluir cambios OpenSpec, informes ni herramientas temporales retiradas y falla ante cualquier coincidencia

### Requirement: Reescritura de historial previa a la apertura del repositorio
Antes de hacer el repositorio público, el proceso SHALL reescribir el historial con `git filter-repo` conservando los siete commits originales y eliminando de cada uno todos los snapshots v1, las identidades pre-anonimización y la cadena del antiguo empleador. La reescritura MUST NOT ejecutarse antes de completar la comparación de equivalencia v1→v2, retener sus informes, completar el scrub del árbol final y verificar la copia offline pre-reescritura. Mientras el repositorio permanece privado y sin protección de rama, el proceso MUST verificar que `Angel-M-R` es la única cuenta con acceso de escritura y después MUST ejecutar exactamente un `git push --force-with-lease` manual. Solo tras comprobar el historial remoto limpio y validar el conjunto completo contra el esquema v2 SHALL cambiar la visibilidad a pública y habilitar y verificar inmediatamente la protección de `master`. Esta operación MUST ser puntual y manual y MUST NOT relajar la prohibición absoluta de force-push del publicador automático.

#### Scenario: Reescritura antes de la comparación de equivalencia
- **WHEN** la comparación de equivalencia v1→v2 todavía no se ha completado
- **THEN** la reescritura de historial MUST NOT ejecutarse

#### Scenario: Reescritura antes del scrub o la copia offline
- **WHEN** el árbol final todavía no pasa el check literal completo o la copia offline pre-reescritura no está verificada
- **THEN** la reescritura de historial MUST NOT ejecutarse

#### Scenario: Secuencia de apertura
- **WHEN** se prepara la apertura del repositorio
- **THEN** primero se completan equivalencia, scrub final y copia offline; después se verifica en privado que solo el propietario tiene escritura, se reescriben y verifican los siete commits, se ejecuta exactamente un `git push --force-with-lease` todavía en privado y sin protección, se comprueba el remoto y se valida de nuevo todo el conjunto v2; solo entonces se cambia la visibilidad a pública y se protege `master` inmediatamente

#### Scenario: Apertura prematura
- **WHEN** el árbol final o cualquier commit original conserva snapshots v1, una identidad pre-anonimización o la cadena del antiguo empleador, el conjunto no valida íntegramente como v2, el push privado limpio no ha terminado o no se ha verificado que solo el propietario tiene escritura
- **THEN** el repositorio MUST NOT hacerse público

#### Scenario: Automatización sin force-push
- **WHEN** el publicador o el job de `launchd` se ejecuta en cualquier momento posterior
- **THEN** ningún camino de código puede ejecutar un force-push ni un reset destructivo

### Requirement: Control de escritura por permisos y protección de rama
Mientras el repositorio siga privado, el proceso SHALL verificar los colaboradores y accesos de escritura actuales y MUST confirmar que `Angel-M-R` es la única cuenta con admin/push antes de la reescritura. El proceso MUST NOT exigir protección de rama privada: GitHub Free no ofrece esa capacidad para este repositorio. La visibilidad pública por sí sola MUST NOT considerarse una concesión de push a cuentas desconocidas, y ninguna comprobación del publicador MUST depender de que el repositorio sea privado.

Después del `git push --force-with-lease` privado limpio, el proceso SHALL hacer público el repositorio y SHALL habilitar y verificar **inmediatamente** la protección de `master`: force-push y borrado MUST quedar deshabilitados y los pushes directos ordinarios fast-forward del propietario MUST permanecer permitidos. Si la protección no puede habilitarse o verificarse después del cambio de visibilidad, la respuesta segura MUST intentar restaurar inmediatamente la visibilidad privada cuando GitHub lo permita y MUST detener el proceso en todos los casos; el repositorio MUST NOT permanecer públicamente expuesto sin el control previsto.

#### Scenario: Colaborador autorizado
- **WHEN** `angel-mac` o `mac-m5` publica con las credenciales personales de un colaborador autorizado
- **THEN** la publicación directa fast-forward se acepta bajo la protección de rama configurada

#### Scenario: Tercero sin permisos
- **WHEN** una cuenta sin permiso de colaborador intenta escribir en `master`
- **THEN** el repositorio rechaza la escritura sin depender de la visibilidad

#### Scenario: Visibilidad bloqueada por prerrequisitos
- **WHEN** falta la evidencia de colaborador único con escritura, scrub final, historial remoto limpio después del único push o validación completa v2
- **THEN** el repositorio permanece privado

#### Scenario: Fallo de protección después de la apertura
- **WHEN** el repositorio ya se ha hecho público pero la protección de `master` no puede habilitarse o verificarse inmediatamente
- **THEN** se intenta restaurar de inmediato la visibilidad privada si es posible y el proceso se detiene obligatoriamente sin continuar el corte

### Requirement: Backfill de todo el histórico disponible
Antes del corte, `angel-mac` SHALL generar snapshots para todo el histórico disponible en sus fuentes locales. Los snapshots agregados ya importados desde SQLite para la `old-mac` retirada MUST aceptarse como su histórico completo disponible; el proceso MUST NOT exigir ni intentar backfill local, publicación futura o instalación en esa máquina. `mac-m5` MUST generar únicamente desde las fuentes disponibles cuando llegue y MUST NOT recibir histórico atribuido a `old-mac`.

#### Scenario: Histórico disponible en logs locales activos
- **WHEN** `angel-mac` ejecuta el backfill con varios años o meses de fuentes disponibles
- **THEN** obtiene un snapshot válido para cada fecha con actividad o cuota

#### Scenario: Histórico completo de la máquina retirada
- **WHEN** se evalúa la cobertura de `old-mac`
- **THEN** se aceptan sus snapshots agregados ya importados desde SQLite como la totalidad de su fuente disponible, sin buscar evidencia local adicional

#### Scenario: Nueva identidad sin herencia histórica
- **WHEN** `mac-m5` inicia su primera generación
- **THEN** escribe solo su propia actividad disponible bajo `snapshots/mac-m5/` y no copia ni reasigna histórico de `old-mac`

### Requirement: Comparación y puerta de corte
El sistema anterior MUST permanecer disponible hasta validar un conjunto completo y correcto de snapshots v2. Dado que la base SQLite legacy ya no existe en ninguna máquina, la puerta previa a la retirada SHALL comparar los totales diarios de los snapshots v2 migrados contra los snapshots v1 previos a la migración recuperados del historial Git, por máquina, fecha y dimensiones en solicitudes, categorías de tokens y costes, además de comprobar cuotas, privacidad y todas las vistas del dashboard mediante evidencia focalizada producida por las tareas. La comparación MUST realizarse sobre totales diarios, ya que el contrato v2 no expone hora, y el desplazamiento de frontera entre día UTC y día local `Europe/Madrid` en los días de borde MUST clasificarse como diferencia esperada y documentada, no como mismatch. La comparación MUST demostrar que la migración v1→v2 preservó los totales dentro de esas reasignaciones documentadas y MUST completarse antes de la reescritura de historial que elimina los snapshots v1. Las clasificaciones de adiciones esperadas ya registradas frente a la cobertura legacy MUST conservarse como hecho histórico y MUST NOT contarse como mismatches sin resolver. La retirada MUST NOT comenzar mientras exista una diferencia no explicada o una comprobación focalizada fallida; las suites completas y los builds pertenecen exclusivamente a la aceptación final posterior a todas las tareas.

#### Scenario: Diferencia no explicada
- **WHEN** los snapshots v2 migrados y los snapshots v1 recuperados difieren en solicitudes, tokens o costes para la misma máquina, fecha y dimensión sin una causa documentada
- **THEN** el corte se bloquea y el sistema anterior permanece intacto

#### Scenario: Desplazamiento de frontera de día
- **WHEN** una diferencia se explica íntegramente por el cambio de día UTC a día local `Europe/Madrid`
- **THEN** el informe la clasifica como diferencia esperada y documentada sin bloquear el corte

#### Scenario: Comparación posterior a la reescritura de historial
- **WHEN** se intenta ejecutar la comparación después de que `git filter-repo` haya eliminado los snapshots v1 del historial
- **THEN** la comparación es imposible y el corte se bloquea, por lo que la comparación MUST completarse antes de la reescritura

#### Scenario: Clasificaciones legacy ya registradas
- **WHEN** se revisan las 137 diferencias de cinco fechas recientes de `angel-mac` clasificadas como adiciones esperadas mientras la SQLite legacy todavía existía
- **THEN** esa clasificación se conserva como hecho histórico y no se vuelve a verificar contra la SQLite legacy

#### Scenario: Puerta de corte aprobada
- **WHEN** el conjunto pasa esquema, privacidad, comparación y comprobaciones focalizadas del dashboard sin diferencias no explicadas
- **THEN** la migración puede avanzar a preparar el punto de reversión, pero no retirar componentes hasta completar la incorporación y publicación concurrente de `mac-m5`

### Requirement: Incorporación de mac-m5 antes del corte
La retirada SHALL esperar hasta que `mac-m5` haya llegado, esté configurada como identidad activa, publique al menos un snapshot válido de su propia carpeta y complete una publicación concurrente satisfactoria con `angel-mac`. La evidencia focalizada MUST confirmar que ninguna ejecución modifica la carpeta de otra identidad y que `old-mac` sigue rechazada por publicador e instalador.

#### Scenario: Nueva máquina todavía no disponible
- **WHEN** `mac-m5` no ha llegado, no está configurada o no ha publicado con éxito
- **THEN** el backend, Docker y SQLite propios permanecen disponibles y la retirada está bloqueada

#### Scenario: Publicación concurrente de las identidades activas
- **WHEN** `angel-mac` y `mac-m5` publican cambios válidos de sus carpetas en competencia
- **THEN** ambas publicaciones terminan sin force-push, cambios cruzados ni escritura en `snapshots/old-mac/`

### Requirement: Punto de reversión previo a la retirada
Antes de eliminar componentes, el proceso SHALL crear un tag que identifique el último sistema anterior validado y SHALL conservar una copia offline no versionada del repositorio previo a la reescritura de historial, por ejemplo un `git bundle` o un clon espejo completo tomado antes del `git filter-repo`, guardada fuera del repositorio. La copia MUST incluir lo necesario para restaurar el estado anterior, MUST verificarse mediante una comprobación de integridad documentada junto con su ubicación de restauración, y MUST NOT exponer rutas ni credenciales en los snapshots versionados.

#### Scenario: Preparación correcta del corte
- **WHEN** el conjunto de snapshots queda validado
- **THEN** existe un tag del sistema anterior y una copia offline verificada del repositorio previo a la reescritura antes de cualquier eliminación

#### Scenario: Copia ausente o ilegible
- **WHEN** no puede verificarse la copia offline del repositorio previo a la reescritura
- **THEN** la retirada se bloquea

### Requirement: Retirada condicionada del sistema anterior
Solo después de superar la puerta de equivalencia, preparar el punto de reversión y completar la incorporación y publicación concurrente de `mac-m5`, el proyecto SHALL eliminar backend, rutas y autenticación HTTP, almacenamiento y migraciones SQLite propios, Docker y contratos de ingesta al servidor. Los adaptadores que leen bases SQLite de aplicaciones de terceros MUST conservar su acceso read-only.

#### Scenario: Retirada tras validación
- **WHEN** se cumplen backfill, comparación por cobertura, punto de reversión y publicación concurrente de `angel-mac` con `mac-m5`
- **THEN** se eliminan los componentes propios de servidor, Docker y SQLite y el dashboard queda exclusivamente local

#### Scenario: Adaptador con fuente SQLite externa
- **WHEN** se retira la SQLite propia de TokenViewer
- **THEN** Cursor, OpenCode o T3 Code pueden seguir leyéndose mediante sus adaptadores read-only

### Requirement: Rollback sin reescribir historial Git
Ante un fallo posterior al corte, la operación SHALL poder detener los jobs de `launchd` de las dos identidades activas, restaurar el código desde el tag pre-migración aprobado y recuperar el estado anterior desde la copia offline no versionada del repositorio previo a la reescritura. El rollback MUST NOT requerir force-push, MUST NOT eliminar los snapshots ya publicados y MUST NOT tratar a la `old-mac` retirada como publicadora; la única reescritura de historial autorizada es la operación manual y puntual previa a hacer el repositorio público.

#### Scenario: Fallo grave después del corte
- **WHEN** el dashboard local o la publicación diaria no puede operar de forma segura
- **THEN** se detiene la automatización y se restaura el estado anterior desde el tag y la copia offline del repositorio previo a la reescritura sin reescribir `master`

### Requirement: Aceptación final independiente de las tareas
Después de completar todas las tareas planificadas, `openspec-verifier` SHALL ejecutar como propietario exclusivo la validación completa de snapshots y privacidad, todas las suites de tests y typecheck del repositorio, todos los builds aplicables y un smoke test local del dashboard. La aceptación MUST confirmar carga local de las tres identidades renombradas, ausencia de cualquier fichero v1 o campo de hora, ausencia de `/api/v1/*`, el resultado registrado de equivalencia v1→v2 sobre totales diarios con sus reasignaciones de frontera de día documentadas y las adiciones esperadas ya clasificadas, publicación operativa de las dos identidades activas, integridad posterior a la retirada y ausencia de hosting público o rutas de datos crudos. Ninguna tarea de implementación MUST depender de ejecutar esta aceptación para marcarse como completada.

#### Scenario: Aceptación final satisfactoria
- **WHEN** todas las tareas planificadas están completas y el verificador ejecuta la aceptación obligatoria
- **THEN** las suites, builds y comprobaciones confirman el sistema local migrado y todas las garantías de retirada

#### Scenario: Fallo en la aceptación final
- **WHEN** una suite completa, build o comprobación de integridad falla
- **THEN** el cambio no obtiene aceptación final y el fallo se remite a una corrección acotada sin reabrir tareas no relacionadas
