## ADDED Requirements

### Requirement: Desarrollo aislado de master
Todo el desarrollo de la migración SHALL realizarse en una rama nueva y MUST NOT editar directamente `master`. La rama confirmada para el trabajo es `feat/git-snapshot-migration`; la publicación operativa directa a `master` solo se habilitará después de integrar y validar la implementación.

#### Scenario: Trabajo de implementación
- **WHEN** se implementan contrato, collector, dashboard, automatización o retirada
- **THEN** los cambios se realizan en `feat/git-snapshot-migration` o en una rama sucesora explícitamente aprobada, nunca directamente en `master`

### Requirement: Backfill de todo el histórico disponible
Antes del corte, `angel-mac` SHALL generar snapshots para todo el histórico disponible en sus fuentes locales. Los snapshots agregados ya importados desde SQLite para la `aon-mac` retirada MUST aceptarse como su histórico completo disponible; el proceso MUST NOT exigir ni intentar backfill local, publicación futura o instalación en esa máquina. `aon-mac-m5` MUST generar únicamente desde las fuentes disponibles cuando llegue y MUST NOT recibir histórico atribuido a `aon-mac`.

#### Scenario: Histórico disponible en logs locales activos
- **WHEN** `angel-mac` ejecuta el backfill con varios años o meses de fuentes disponibles
- **THEN** obtiene un snapshot válido para cada fecha con actividad o cuota

#### Scenario: Histórico completo de la máquina retirada
- **WHEN** se evalúa la cobertura de `aon-mac`
- **THEN** se aceptan sus snapshots agregados ya importados desde SQLite como la totalidad de su fuente disponible, sin buscar evidencia local adicional

#### Scenario: Nueva identidad sin herencia histórica
- **WHEN** `aon-mac-m5` inicia su primera generación
- **THEN** escribe solo su propia actividad disponible bajo `snapshots/aon-mac-m5/` y no copia ni reasigna histórico de `aon-mac`

### Requirement: Comparación y puerta de corte
El sistema anterior MUST permanecer disponible hasta validar un conjunto completo y correcto de snapshots. La puerta previa a la retirada SHALL comparar estrictamente, dentro de la cobertura temporal solapada, solicitudes, categorías de tokens y costes por máquina, fecha y dimensiones contra SQLite, además de comprobar cuotas, privacidad y todas las vistas del dashboard mediante evidencia focalizada producida por las tareas. Fechas válidas de fuente local fuera de la cobertura legacy MUST clasificarse como adiciones esperadas y MUST NOT contarse como mismatches sin resolver. La retirada MUST NOT comenzar mientras exista una diferencia no explicada dentro del solapamiento o una comprobación focalizada fallida; las suites completas y los builds pertenecen exclusivamente a la aceptación final posterior a todas las tareas.

#### Scenario: Diferencia no explicada
- **WHEN** los snapshots y SQLite difieren en solicitudes, tokens o costes para la misma máquina, fecha y dimensión dentro de su cobertura solapada sin una causa documentada
- **THEN** el corte se bloquea y el sistema anterior permanece intacto

#### Scenario: Fecha local posterior a la cobertura legacy
- **WHEN** una fecha válida de fuente local existe en snapshots pero queda fuera de la cobertura de SQLite
- **THEN** el informe la clasifica como adición esperada y no la presenta como mismatch no resuelto

#### Scenario: Diferencias actuales de angel-mac
- **WHEN** las 137 diferencias corresponden a cinco fechas recientes de `angel-mac` posteriores a la cobertura SQLite
- **THEN** se clasifican como adiciones esperadas, manteniendo comparación estricta para todas las fechas solapadas

#### Scenario: Puerta de corte aprobada
- **WHEN** el conjunto pasa esquema, privacidad, comparación y comprobaciones focalizadas del dashboard sin diferencias no explicadas
- **THEN** la migración puede avanzar a preparar el punto de reversión, pero no retirar componentes hasta completar la incorporación y publicación concurrente de `aon-mac-m5`

### Requirement: Incorporación de aon-mac-m5 antes del corte
La retirada SHALL esperar hasta que `aon-mac-m5` haya llegado, esté configurada como identidad activa, publique al menos un snapshot válido de su propia carpeta y complete una publicación concurrente satisfactoria con `angel-mac`. La evidencia focalizada MUST confirmar que ninguna ejecución modifica la carpeta de otra identidad y que `aon-mac` sigue rechazada por publicador e instalador.

#### Scenario: Nueva máquina todavía no disponible
- **WHEN** `aon-mac-m5` no ha llegado, no está configurada o no ha publicado con éxito
- **THEN** el backend, Docker y SQLite propios permanecen disponibles y la retirada está bloqueada

#### Scenario: Publicación concurrente de las identidades activas
- **WHEN** `angel-mac` y `aon-mac-m5` publican cambios válidos de sus carpetas en competencia
- **THEN** ambas publicaciones terminan sin force-push, cambios cruzados ni escritura en `snapshots/aon-mac/`

### Requirement: Punto de reversión previo a la retirada
Antes de eliminar componentes, el proceso SHALL crear un tag que identifique el último sistema anterior validado y SHALL conservar una copia offline de SQLite fuera del repositorio y sin versionar. La copia MUST incluir lo necesario para restaurar el sistema anterior y MUST verificarse como legible.

#### Scenario: Preparación correcta del corte
- **WHEN** el conjunto de snapshots queda validado
- **THEN** existe un tag del sistema anterior y una copia offline legible antes de cualquier eliminación

#### Scenario: Copia ausente o ilegible
- **WHEN** no puede verificarse la copia offline de SQLite
- **THEN** la retirada se bloquea

### Requirement: Retirada condicionada del sistema anterior
Solo después de superar la puerta de equivalencia, preparar el punto de reversión y completar la incorporación y publicación concurrente de `aon-mac-m5`, el proyecto SHALL eliminar backend, rutas y autenticación HTTP, almacenamiento y migraciones SQLite propios, Docker y contratos de ingesta al servidor. Los adaptadores que leen bases SQLite de aplicaciones de terceros MUST conservar su acceso read-only.

#### Scenario: Retirada tras validación
- **WHEN** se cumplen backfill, comparación por cobertura, punto de reversión y publicación concurrente de `angel-mac` con `aon-mac-m5`
- **THEN** se eliminan los componentes propios de servidor, Docker y SQLite y el dashboard queda exclusivamente local

#### Scenario: Adaptador con fuente SQLite externa
- **WHEN** se retira la SQLite propia de TokenViewer
- **THEN** Cursor, OpenCode o T3 Code pueden seguir leyéndose mediante sus adaptadores read-only

### Requirement: Rollback sin reescribir historial Git
Ante un fallo posterior al corte, la operación SHALL poder detener los jobs de `launchd`, restaurar el código desde el tag y arrancar el sistema anterior con la copia offline de SQLite. El rollback MUST NOT requerir force-push ni eliminar los snapshots ya publicados.

#### Scenario: Fallo grave después del corte
- **WHEN** el dashboard local o la publicación diaria no puede operar de forma segura
- **THEN** se detiene la automatización y se restaura el sistema anterior desde el tag y la copia offline sin reescribir `master`

### Requirement: Aceptación final independiente de las tareas
Después de completar todas las tareas planificadas, `openspec-verifier` SHALL ejecutar como propietario exclusivo la validación completa de snapshots y privacidad, todas las suites de tests y typecheck del repositorio, todos los builds aplicables y un smoke test local del dashboard. La aceptación MUST confirmar carga local de las tres identidades, ausencia de `/api/v1/*`, equivalencia estricta dentro de la cobertura solapada, clasificación de adiciones exteriores, publicación operativa de las dos identidades activas, integridad posterior a la retirada y ausencia de hosting público o rutas de datos crudos. Ninguna tarea de implementación MUST depender de ejecutar esta aceptación para marcarse como completada.

#### Scenario: Aceptación final satisfactoria
- **WHEN** todas las tareas planificadas están completas y el verificador ejecuta la aceptación obligatoria
- **THEN** las suites, builds y comprobaciones confirman el sistema local migrado y todas las garantías de retirada

#### Scenario: Fallo en la aceptación final
- **WHEN** una suite completa, build o comprobación de integridad falla
- **THEN** el cambio no obtiene aceptación final y el fallo se remite a una corrección acotada sin reabrir tareas no relacionadas
