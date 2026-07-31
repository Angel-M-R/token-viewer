## ADDED Requirements

### Requirement: Partición canónica por máquina y día local
El sistema SHALL almacenar cada snapshot diario en `snapshots/<machine>/YYYY/MM/YYYY-MM-DD.json`, donde `<machine>` MUST ser `angel-mac`, `old-mac` o `mac-m5`. La fecha declarada en el documento MUST ser el día local `Europe/Madrid` y MUST coincidir junto con la identidad con su ruta. Cada fecha de cada máquina MUST tener como máximo un fichero canónico. La validación del contrato MUST aceptar las tres identidades independientemente de que `old-mac` sea histórica y no publicadora.

#### Scenario: Snapshot en ruta válida
- **WHEN** se valida `snapshots/angel-mac/2026/07/2026-07-26.json` con `machine = "angel-mac"` y `date = "2026-07-26"`
- **THEN** la ruta y la identidad se aceptan

#### Scenario: Identidad distinta de la carpeta
- **WHEN** un documento bajo `snapshots/old-mac/` declara `machine = "angel-mac"`
- **THEN** la validación falla antes de permitir su commit

#### Scenario: Snapshot de la nueva identidad activa
- **WHEN** se valida un fichero bajo `snapshots/mac-m5/` que declara la misma identidad y fecha de su ruta
- **THEN** el contrato lo acepta como snapshot canónico

#### Scenario: Snapshot histórico de la identidad retirada
- **WHEN** se valida un fichero ya importado y migrado bajo `snapshots/old-mac/`
- **THEN** el contrato lo acepta para consultas y validación sin exigir que esa identidad pueda volver a publicar

#### Scenario: Identidad fuera del registro público
- **WHEN** se valida un fichero bajo una ruta de máquina distinta de `angel-mac`, `old-mac` o `mac-m5`
- **THEN** la validación falla porque esa identidad no existe en el contrato

### Requirement: Versión de esquema 2 exclusiva
Cada snapshot MUST declarar `schemaVersion = 2`. El validador SHALL aceptar únicamente la versión 2 y MUST rechazar cualquier otra versión, incluida la versión 1 previa a la migración. No SHALL existir lectura dual, conversión perezosa ni compatibilidad hacia atrás con el esquema v1.

#### Scenario: Snapshot v2
- **WHEN** un fichero declara `schemaVersion = 2` y cumple el resto del contrato
- **THEN** la validación lo acepta

#### Scenario: Snapshot v1 residual
- **WHEN** un fichero declara `schemaVersion = 1`
- **THEN** la validación falla y el fichero MUST NOT poder publicarse

### Requirement: Agregados diarios de uso
Cada snapshot SHALL contener filas de uso agrupadas por máquina, agente, proveedor y modelo dentro de su día local. Cada fila MUST incluir solicitudes, `inputTokens`, `outputTokens`, `reasoningTokens`, `cacheReadTokens`, `cacheWriteTokens`, coste estimado, coste facturado y solicitudes sin precio; todos los contadores y costes presentes MUST ser finitos y no negativos. Ninguna fila MUST contener un campo de hora ni ninguna otra precisión subdiaria. Proveedor y modelo desconocidos MUST representarse con un valor canónico explícito.

#### Scenario: Dos registros con la misma clave diaria
- **WHEN** dos registros pertenecen al mismo día local, máquina, agente, proveedor y modelo
- **THEN** el snapshot contiene una fila cuya solicitudes, tokens y costes son la suma de ambos registros

#### Scenario: Registros de distintas horas del mismo día
- **WHEN** dos registros de la misma clave ocurren a las 09:00 y a las 23:00 hora local
- **THEN** se acumulan en la misma fila y el snapshot no conserva ninguna distinción horaria

#### Scenario: Dimensión distinta
- **WHEN** dos registros del mismo día difieren en agente, proveedor o modelo
- **THEN** se almacenan en filas agregadas distintas

#### Scenario: Campo de hora presente
- **WHEN** una fila incluye una propiedad de hora residual del esquema v1
- **THEN** la validación falla por propiedad no declarada

### Requirement: Asignación del día en Europe/Madrid
El generador SHALL asignar cada registro al día local `Europe/Madrid` correspondiente a su instante. La misma definición local MUST usarse para determinar el día abierto que se regenera en cada ejecución y para evaluar qué días están cerrados.

#### Scenario: Registro de madrugada en horario de verano
- **WHEN** un registro ocurre a las 23:30 UTC del 15 de julio, que son las 01:30 hora local del 16 de julio
- **THEN** se agrega al snapshot del día 16, no al del día 15

#### Scenario: Día abierto
- **WHEN** el collector determina qué día debe regenerar
- **THEN** usa el día local `Europe/Madrid` actual y no el día UTC

### Requirement: Coste calculado antes de agregar
El generador SHALL calcular el coste local de cada registro normalizado antes de sumarlo a una fila agregada. Un registro sin tarifa resoluble MUST incrementar las solicitudes y `unpricedRequests` sin inventar coste estimado, y un coste facturado proporcionado por la fuente MUST conservarse en el total facturado.

#### Scenario: Mezcla de registros con y sin precio
- **WHEN** una clave diaria contiene un registro valorado y otro sin tarifa resoluble
- **THEN** la fila cuenta dos solicitudes, suma solo el coste estimado del registro valorado y reporta una solicitud sin precio

#### Scenario: Coste facturado de la fuente
- **WHEN** un registro incluye un coste facturado válido
- **THEN** ese importe se suma al coste facturado después de calcular por separado el coste estimado local

### Requirement: Histórico de cuotas sanitizado sin hora
Cada snapshot SHALL poder contener muestras históricas de cuota con únicamente `provider`, `takenAt`, `percentUsed`, `plan` y `resetsAt`. `takenAt` MUST ser una fecha local `Europe/Madrid` sin componente horario y MUST coincidir con la fecha del snapshot. El porcentaje MUST estar entre 0 y 100 cuando exista. El documento MUST NOT contener login, identidad de cuenta ni payload original.

#### Scenario: Cuota completa
- **WHEN** el collector obtiene porcentaje, plan y renovación de Copilot
- **THEN** el snapshot conserva esos campos y la fecha local de captura sin hora, sin login ni respuesta original

#### Scenario: takenAt con hora
- **WHEN** una muestra declara `takenAt` con componente horario
- **THEN** la validación falla

#### Scenario: Campos opcionales ausentes
- **WHEN** una cuota no incluye plan, porcentaje o renovación
- **THEN** la muestra sigue siendo válida con esos campos ausentes o nulos según el esquema canónico

### Requirement: Esquema cerrado y privacidad
El esquema de snapshot MUST rechazar propiedades desconocidas y MUST impedir que se versionen prompts, conversaciones, mensajes, sesiones, proyectos, rutas, credenciales, tokens de autenticación, login, datos crudos, `raw`, `sourceFile`, `recordHash`, campos de hora u otros identificadores innecesarios. Los registros individuales MUST NOT aparecer directa ni indirectamente en los ficheros versionados. Este esquema cerrado MUST ser la salvaguarda de privacidad de los payloads de snapshots. El gate separado que busca los literales exactos pre-anonimización y la cadena del antiguo empleador en todo el árbol Git MUST limitarse a demostrar el renombrado completo del repositorio y MUST NOT sustituir la validación de esquema.

#### Scenario: Campo crudo conocido
- **WHEN** un snapshot contiene una propiedad `raw`, `sourceFile`, `session`, `project`, `login`, `hour` o `recordHash`
- **THEN** la validación de privacidad falla

#### Scenario: Propiedad no declarada
- **WHEN** una actualización añade una propiedad que no pertenece al esquema cerrado
- **THEN** la validación falla hasta que el contrato y su revisión de privacidad se actualicen explícitamente

#### Scenario: Responsabilidades separadas de las salvaguardas
- **WHEN** CI valida una revisión candidata a publicación
- **THEN** el esquema cerrado valida los payloads de snapshots y el check literal separado recorre todo el árbol Git versionado para demostrar el renombrado completo

### Requirement: Invariantes del conjunto
El validador SHALL comprobar cada fichero y el conjunto completo: unicidad de ruta y clave agregada, pertenencia de las cuotas a la fecha declarada, orden canónico, versión de esquema, valores válidos y consistencia de cualquier total derivado. La serialización MUST ser determinista para que la misma entrada produzca el mismo contenido.

#### Scenario: Clave agregada duplicada
- **WHEN** un snapshot contiene dos filas con el mismo agente, proveedor y modelo
- **THEN** la validación falla

#### Scenario: Regeneración sin cambios
- **WHEN** el generador procesa las mismas fuentes con el mismo contrato y revisión de precios
- **THEN** produce bytes equivalentes y no crea un diff Git
