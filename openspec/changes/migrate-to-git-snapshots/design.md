## Context

TokenViewer centraliza actualmente registros individuales enviados por el collector a un servidor HTTP que calcula precios, persiste uso y cuotas en SQLite y sirve agregados al dashboard. El cambio sustituye esa cadena por artefactos diarios agregados dentro de un repositorio Git privado, manteniendo el collector y todas las vistas y filtros del dashboard, pero eliminando la persistencia propia en SQLite, el backend y Docker.

El registro queda deliberadamente limitado a tres identidades macOS. `angel-mac` y `aon-mac-m5` son las únicas publicadoras activas: cada una tendrá credenciales Git personales, ejecutará una tarea diaria con `launchd` y será la única escritora de su carpeta. La `aon-mac` original está retirada permanentemente; su carpeta sigue siendo una fuente histórica de solo lectura formada exclusivamente por los snapshots agregados ya importados desde SQLite. Los datos versionados no pueden contener registros individuales ni campos capaces de revelar prompts, conversaciones, sesiones, proyectos, rutas, credenciales, login de cuenta o payloads originales.

## Goals / Non-Goals

**Goals:**

- Producir snapshots reproducibles por máquina y fecha con agregados horarios de solicitudes, cinco categorías de tokens y costes por agente, proveedor y modelo.
- Calcular cada coste en memoria sobre el registro normalizado antes de incorporarlo al agregado, conservando costes facturados cuando existan y contabilizando registros sin precio.
- Reconstruir el histórico disponible y cualquier fecha ausente sin versionar datos crudos.
- Permitir que el dashboard local consulte directamente los snapshots y conserve resumen, series diarias, heatmaps, desglose por modelos, cuotas y filtros actuales compatibles con datos agregados.
- Publicar con seguridad directamente en `master`, tolerar la concurrencia entre las carpetas de `angel-mac` y `aon-mac-m5` y conservar commits no publicados para la ejecución siguiente.
- Validar localmente antes de cada commit y validar el conjunto completo en CI.
- Ejecutar un corte verificable y reversible antes de retirar servidor, Docker y la SQLite de TokenViewer.

**Non-Goals:**

- Hosting público, sincronización en tiempo real o acceso remoto al dashboard.
- Drill-down de registros individuales o versionado de cualquier dato crudo o identificador innecesario.
- Soporte para identidades distintas de `angel-mac`, `aon-mac` y `aon-mac-m5`, ni una plataforma de publicación genérica.
- Backfill local, publicación futura o instalación operativa para la `aon-mac` retirada.
- Sustituir el acceso de solo lectura de los adaptadores a las bases SQLite pertenecientes a aplicaciones de terceros; se retira únicamente SQLite como almacenamiento propio de TokenViewer.
- Cambiar el diseño visual o ampliar métricas y vistas del dashboard.

## Decisions

### 1. Un fichero canónico por máquina y fecha UTC

Los datos vivirán bajo `snapshots/<machine>/YYYY/MM/YYYY-MM-DD.json`, donde `<machine>` puede ser `angel-mac`, `aon-mac` o `aon-mac-m5`. El contrato y el dashboard aceptarán las tres identidades; el ciclo de vida se aplicará por separado para que solo `angel-mac` y `aon-mac-m5` puedan generar o publicar. Cada fichero tendrá `schemaVersion`, identidad de máquina, fecha UTC, metadatos mínimos de generación, filas de uso horario y muestras de cuota sanitizadas.

Cada fila de uso identificará una hora UTC y la combinación `agent/provider/model`, con `requests`, las cinco categorías de tokens, coste estimado, coste facturado y recuento sin precio. Las muestras de cuota contendrán únicamente proveedor, instante UTC, porcentaje, plan y renovación. Los valores desconocidos de proveedor o modelo usarán un valor canónico explícito en vez de omitir dimensiones.

Esta partición evita ficheros compartidos entre máquinas, acota diffs y permite descubrir días sin un índice global que causaría conflictos. Se descarta un único fichero histórico porque crecería indefinidamente y mezclaría escritores; también se descartan registros individuales porque contradicen la privacidad y la granularidad confirmadas.

### 2. Agregación local determinista con días cerrados

El collector seguirá usando los adaptadores existentes para normalizar fuentes locales, pero los registros vivirán solo en memoria. Para cada registro válido se resolverá el precio localmente y después se acumulará en su clave horaria. `recordHash` podrá usarse durante la ejecución para deduplicar, pero nunca se escribirá al snapshot.

Cada ejecución de una publicadora activa reconstruirá todas las fechas ausentes para las que aún existan fuentes y regenerará el día UTC abierto. Los días cerrados existentes serán inmutables en la operación normal; una reparación explícita podrá regenerarlos con validación y diff visibles. `angel-mac` procesará su histórico local disponible y `aon-mac-m5` empezará con las fuentes disponibles cuando llegue. `aon-mac` no ejecutará generación: sus snapshots SQLite ya importados se aceptan como su histórico completo disponible. Este modelo evita sumar dos veces tras perder un cursor y evita repricing silencioso de días ya publicados.

Se descarta depender solo de cursores incrementales y sumar sobre ficheros previos: un estado corrupto podría duplicar agregados sin conservar hashes individuales. El estado local puede seguir optimizando descubrimiento y diagnóstico, pero la presencia y validez de los snapshots es la fuente de verdad para detectar días faltantes, y solo se confirma después de persistir y publicar con éxito.

### 3. Esquema estricto e invariantes de privacidad

El contrato compartido validará tanto cada fichero como el conjunto. Además de tipos y rangos, comprobará que la máquina y fecha coincidan con la ruta, que las horas pertenezcan al día, que no haya claves agregadas duplicadas, que contadores y costes sean finitos y no negativos, y que los totales coincidan con la suma de filas cuando existan totales derivados.

La validación rechazará claves prohibidas, incluidas variantes de prompt, conversación, sesión, proyecto, ruta, credencial, token de autenticación, login, payload original, `raw`, `sourceFile` y `recordHash`. Se usará un esquema cerrado para que campos nuevos no se publiquen accidentalmente. El mismo validador se ejecutará antes de escribir, antes de commit y sobre todo `snapshots/` en CI.

Se descarta una lista de campos permitidos aplicada solo al final del pipeline porque una serialización intermedia o un cambio de tipo podría filtrar datos; el tipo agregado y el serializador serán sanitizados desde su frontera.

### 4. Capa local compatible para el dashboard

El dashboard descubrirá los JSON mediante imports estáticos de Vite, sin servidor ni token de dashboard. Una capa de repositorio local validará los módulos cargados y expondrá operaciones equivalentes a las consultas que consumen los hooks actuales: filtros por máquina, agente, proveedor, modelo y rango; resumen; serie diaria; heatmap; modelos y cuotas.

Las agregaciones secundarias se harán en el navegador sobre filas horarias. La zona horaria del heatmap se derivará desde la hora UTC almacenada; esta precisión corresponde a la granularidad horaria confirmada. Las cuotas se agruparán por cualquiera de las tres identidades de máquina y proveedor, no por login, y las cards conservarán porcentaje, plan, renovación y serie histórica sin mostrar identidad de cuenta.

Se conservarán los tipos de respuesta de la capa de UI siempre que no representen registros individuales, minimizando cambios en componentes. El drill-down paginado y el gate de Bearer desaparecerán porque no tienen fuente válida ni función en una ejecución exclusivamente local. Se descarta levantar un servidor local de compatibilidad porque mantendría el backend que se quiere retirar.

### 5. Publicador Git transaccional y propietario por carpeta

Cada `launchd` de `angel-mac` o `aon-mac-m5` apuntará a un checkout o worktree operativo dedicado sobre `master`, separado de la rama de desarrollo. El publicador verificará repositorio, rama, remoto, identidad activa y árbol limpio salvo un commit pendiente propio antes de trabajar. La preflight rechazará explícitamente `aon-mac`, aunque el validador del conjunto siga aceptando su carpeta histórica.

La secuencia será: recuperar primero cualquier commit pendiente; `git pull --rebase origin master`; generar solo dentro de la carpeta de la máquina; validar localmente; crear un commit de datos solo si hay diff; intentar `git push origin master`. Ante rechazo no fast-forward, hará un número limitado de ciclos `pull --rebase` y `push`. Nunca usará force-push, reset destructivo ni descartará un commit ya creado. Si agota reintentos o pierde red, finalizará con error dejando el commit para la próxima ejecución.

Se descarta una rama por máquina porque añade integración periódica y contradice la publicación directa confirmada. La propiedad disjunta de carpetas reduce conflictos; cualquier conflicto real detendrá la automatización para intervención en vez de resolver o sobrescribir datos automáticamente.

### 6. Automatización macOS explícita para dos publicadoras activas

El repositorio incluirá una plantilla y un instalador verificable de `launchd` que materialicen un plist para `angel-mac` o `aon-mac-m5` con ejecución diaria, directorio de trabajo operativo, PATH explícito y logs locales. La configuración no contendrá credenciales: Git reutilizará el llavero y la configuración personal existentes.

La instalación exigirá elegir una de las dos identidades activas y comprobará que coincide con la carpeta escrita. `aon-mac` y cualquier nombre desconocido se rechazarán antes de crear o cargar un plist. No se crea una abstracción multiplataforma ni un registro dinámico de máquinas.

### 7. CI valida datos y aplicación

Cada actualización de `master` ejecutará el validador sobre todos los snapshots, pruebas unitarias del contrato, agregación, pricing, publicación y repositorio local del dashboard, además de los tests y builds aplicables del monorepo. Las pruebas focalizadas usarán fixtures de las tres identidades, demostrarán que `aon-mac` es válida para lectura pero inválida para publicación o instalación, y probarán con repositorios Git temporales la carrera entre `angel-mac` y `aon-mac-m5`, rebase, reintentos, fallo de red, ausencia de diff y conservación de commits.

CI no corrige snapshots. Un fallo bloquea la señal de validez y requiere que la máquina propietaria publique una reparación. Se descarta generar un manifiesto global versionado porque convertiría cada ejecución en una escritura compartida.

### 8. Corte por etapas con comparación contra el sistema actual

El backfill se desarrollará y probará en `feat/git-snapshot-migration`. Antes de retirar nada, `angel-mac` generará todo su histórico local disponible. Para la `aon-mac` retirada, los snapshots agregados ya importados desde SQLite se aceptarán como su fuente completa disponible y no se intentará backfill local. `aon-mac-m5` no tendrá obligación de histórico legacy: deberá quedar configurada y publicar correctamente su actividad disponible cuando llegue.

La equivalencia comparará por máquina, fecha y dimensiones los requests, tokens y costes únicamente dentro de la cobertura compartida por SQLite y snapshots. Cualquier discrepancia dentro de ese solapamiento seguirá bloqueando el corte hasta resolverse o aceptarse explícitamente. Una fecha válida de fuente local posterior o exterior a la cobertura de SQLite se clasificará como adición esperada, no como mismatch; esto incluye las cinco fechas recientes de `angel-mac` que explican las 137 diferencias actuales. Las clasificaciones y explicaciones serán agregadas y no sensibles.

La copia offline no versionada de SQLite se conservará y verificará antes de la retirada. Después de validar el conjunto completo, la equivalencia y el dashboard local mediante evidencia focalizada de las tareas, todavía se esperará a que `aon-mac-m5` llegue, quede configurada, realice una publicación válida y complete una prueba de publicación concurrente con `angel-mac` sin cambios cruzados. Solo entonces se obtendrá la aprobación de corte, se creará el tag del último sistema anterior y podrán eliminarse servidor, rutas HTTP, migraciones, Docker y dependencias SQLite propias. Los adaptadores que leen SQLite de terceros permanecerán.

Se descarta retirar infraestructura al comienzo porque eliminaría la referencia necesaria para comprobar el backfill y aumentaría el riesgo de pérdida histórica.

### 9. Verificación completa propiedad del verificador final

Los implementadores de tareas completarán cada unidad con cambios acotados y únicamente lint, typecheck o pruebas mínimas directamente relevantes. Ninguna tarea planificada exigirá ejecutar un build ni una suite completa del repositorio para marcarse como terminada.

Cuando todas las tareas planificadas estén completas, `openspec-verifier` será el propietario exclusivo de la aceptación final obligatoria. Ejecutará la validación completa de snapshots y privacidad, las suites completas de tests y typecheck, todos los builds aplicables y un smoke test local del dashboard. Esa aceptación confirmará carga local de las tres identidades, publicación exclusiva de las dos activas, equivalencia estricta dentro de la cobertura solapada, clasificación de adiciones exteriores, ausencia de `/api/v1/*`, integridad posterior a la retirada y ausencia de hosting público o rutas de datos crudos. Este trabajo queda fuera del checklist de implementación y no puede bloquear la finalización de una tarea individual.

## Risks / Trade-offs

- [Un snapshot horario no permite recuperar registros individuales ni precisión subhoraria] → Es una pérdida deliberada de acuerdo con privacidad y alcance; las consultas y pruebas se ajustarán a la granularidad horaria.
- [Un día cerrado podría recibir actividad tardía] → El día abierto se regenera en cada ejecución y las reparaciones históricas serán explícitas, validadas y revisables.
- [Los pushes directos de `angel-mac` y `aon-mac-m5` pueden competir] → Carpetas disjuntas, checkout dedicado, `pull --rebase`, reintentos limitados y conservación del commit pendiente.
- [Una credencial Git o la red puede fallar durante días] → `launchd` deja logs, el comando devuelve error y el commit local se conserva para reintento posterior.
- [El repositorio puede crecer con el histórico] → Partición diaria y agregación horaria limitan el volumen; CI podrá vigilar tamaño y número de filas sin introducir compactación prematura.
- [Cambios del catálogo de precios pueden alterar reconstrucciones] → Los días publicados permanecen inmutables por defecto y cada snapshot registra metadatos no sensibles suficientes para auditar su generación.
- [La validación por nombres prohibidos no detecta todo dato sensible en valores libres] → El esquema evita campos libres salvo dimensiones normalizadas y pruebas de privacidad cubren serialización y fixtures representativos.
- [La retirada de SQLite puede confundirse con las SQLite de aplicaciones fuente] → Las tareas de eliminación distinguirán explícitamente almacenamiento propio del acceso read-only de adaptadores.
- [La identidad histórica podría habilitarse accidentalmente como publicadora] → Registro con ciclos de vida separados y rechazo focalizado de `aon-mac` en configuración, preflight e instalación, sin excluirla del validador ni del dashboard.
- [La cobertura local puede superar la cobertura de SQLite] → La equivalencia clasifica fechas exteriores como adiciones esperadas y mantiene comparación estricta métrica a métrica dentro del solapamiento.

## Migration Plan

1. Implementar contrato, validador, agregador, pricing local y generación diaria en la rama `feat/git-snapshot-migration`, sin cambiar aún la operación de producción.
2. Implementar el repositorio local del dashboard y comprobar todas las vistas y filtros contra fixtures y snapshots reales sanitizados.
3. Separar las tres identidades válidas para snapshots de las dos identidades publicadoras, y adaptar publicación Git, pruebas de concurrencia, CI e instalación `launchd` para `angel-mac` y `aon-mac-m5`, rechazando `aon-mac` en rutas operativas.
4. Conservar la copia offline no versionada de SQLite, aceptar los snapshots agregados ya importados como histórico completo de `aon-mac`, completar el backfill local de `angel-mac` y no exigir histórico legacy a `aon-mac-m5`.
5. Validar esquema, privacidad e invariantes del conjunto; comparar estrictamente la cobertura solapada con SQLite; clasificar fechas válidas exteriores como adiciones esperadas; y validar el dashboard local mediante comprobaciones focalizadas, sin ejecutar suites completas ni builds como condición de las tareas.
6. Crear el tag del último sistema anterior una vez fijado el punto de reversión y antes de eliminar componentes.
7. Esperar la llegada de `aon-mac-m5`, configurarla y verificar su primera publicación; activar checkouts operativos y `launchd` únicamente para las dos identidades activas y solo tras integrar la rama mediante el proceso normal.
8. Observar al menos una ejecución diaria y una publicación concurrente satisfactoria de `angel-mac` y `aon-mac-m5`, sin cambios cruzados ni publicación de `aon-mac`, antes de retirar backend, almacenamiento SQLite propio, Docker, autenticación y contratos HTTP.
9. Una vez completadas todas las tareas planificadas, encargar a `openspec-verifier` la aceptación final obligatoria con validaciones, suites completas, typecheck, builds y smoke test local.

Rollback: detener o descargar los jobs de `launchd`, conservar los snapshots ya publicados, restaurar el código desde el tag y arrancar el sistema anterior con la copia offline de SQLite. No se reescribirá `master` ni se hará force-push para revertir datos.

## Open Questions

No quedan decisiones de alcance abiertas. Las rutas locales concretas del checkout operativo y de los logs de `launchd` se resolverán durante la instalación en cada Mac sin alterar el contrato, la identidad ni la política de datos.
