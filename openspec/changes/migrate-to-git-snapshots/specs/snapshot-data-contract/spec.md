## ADDED Requirements

### Requirement: Partición canónica por máquina y fecha
El sistema SHALL almacenar cada snapshot diario en `snapshots/<machine>/YYYY/MM/YYYY-MM-DD.json`, donde `<machine>` MUST ser `angel-mac`, `old-mac` o `mac-m5`, y la identidad y fecha UTC declaradas en el documento MUST coincidir con su ruta. Cada fecha de cada máquina MUST tener como máximo un fichero canónico. La validación del contrato MUST aceptar las tres identidades independientemente de que `old-mac` sea histórica y no publicadora.

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
- **WHEN** se valida un fichero ya importado bajo `snapshots/old-mac/`
- **THEN** el contrato lo acepta para consultas y validación sin exigir que esa identidad pueda volver a publicar

### Requirement: Agregados horarios de uso
Cada snapshot SHALL contener filas de uso agrupadas por hora UTC, máquina, agente, proveedor y modelo. Cada fila MUST incluir solicitudes, `inputTokens`, `outputTokens`, `reasoningTokens`, `cacheReadTokens`, `cacheWriteTokens`, coste estimado, coste facturado y solicitudes sin precio; todos los contadores y costes presentes MUST ser finitos y no negativos. Proveedor y modelo desconocidos MUST representarse con un valor canónico explícito.

#### Scenario: Dos registros con la misma clave horaria
- **WHEN** dos registros pertenecen a la misma hora UTC, máquina, agente, proveedor y modelo
- **THEN** el snapshot contiene una fila cuya solicitudes, tokens y costes son la suma de ambos registros

#### Scenario: Dimensión distinta
- **WHEN** dos registros de la misma hora difieren en agente, proveedor o modelo
- **THEN** se almacenan en filas agregadas distintas

### Requirement: Coste calculado antes de agregar
El generador SHALL calcular el coste local de cada registro normalizado antes de sumarlo a una fila agregada. Un registro sin tarifa resoluble MUST incrementar las solicitudes y `unpricedRequests` sin inventar coste estimado, y un coste facturado proporcionado por la fuente MUST conservarse en el total facturado.

#### Scenario: Mezcla de registros con y sin precio
- **WHEN** una clave horaria contiene un registro valorado y otro sin tarifa resoluble
- **THEN** la fila cuenta dos solicitudes, suma solo el coste estimado del registro valorado y reporta una solicitud sin precio

#### Scenario: Coste facturado de la fuente
- **WHEN** un registro incluye un coste facturado válido
- **THEN** ese importe se suma al coste facturado después de calcular por separado el coste estimado local

### Requirement: Histórico de cuotas sanitizado
Cada snapshot SHALL poder contener muestras históricas de cuota con únicamente `provider`, `takenAt`, `percentUsed`, `plan` y `resetsAt`. El porcentaje MUST estar entre 0 y 100 cuando exista, y las fechas MUST ser ISO 8601 UTC. El documento MUST NOT contener login, identidad de cuenta ni payload original.

#### Scenario: Cuota completa
- **WHEN** el collector obtiene porcentaje, plan y renovación de Copilot
- **THEN** el snapshot conserva esos campos y el instante de captura sin login ni respuesta original

#### Scenario: Campos opcionales ausentes
- **WHEN** una cuota no incluye plan, porcentaje o renovación
- **THEN** la muestra sigue siendo válida con esos campos ausentes o nulos según el esquema canónico

### Requirement: Esquema cerrado y privacidad
El esquema de snapshot MUST rechazar propiedades desconocidas y MUST impedir que se versionen prompts, conversaciones, mensajes, sesiones, proyectos, rutas, credenciales, tokens de autenticación, login, datos crudos, `raw`, `sourceFile`, `recordHash` u otros identificadores innecesarios. Los registros individuales MUST NOT aparecer directa ni indirectamente en los ficheros versionados.

#### Scenario: Campo crudo conocido
- **WHEN** un snapshot contiene una propiedad `raw`, `sourceFile`, `session`, `project`, `login` o `recordHash`
- **THEN** la validación de privacidad falla

#### Scenario: Propiedad no declarada
- **WHEN** una actualización añade una propiedad que no pertenece al esquema cerrado
- **THEN** la validación falla hasta que el contrato y su revisión de privacidad se actualicen explícitamente

### Requirement: Invariantes del conjunto
El validador SHALL comprobar cada fichero y el conjunto completo: unicidad de ruta y clave agregada, pertenencia de las horas y cuotas a la fecha declarada, orden canónico, valores válidos y consistencia de cualquier total derivado. La serialización MUST ser determinista para que la misma entrada produzca el mismo contenido.

#### Scenario: Clave agregada duplicada
- **WHEN** un snapshot contiene dos filas con la misma hora, agente, proveedor y modelo
- **THEN** la validación falla

#### Scenario: Regeneración sin cambios
- **WHEN** el generador procesa las mismas fuentes con el mismo contrato y revisión de precios
- **THEN** produce bytes equivalentes y no crea un diff Git
