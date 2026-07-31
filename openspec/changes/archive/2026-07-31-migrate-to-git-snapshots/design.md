## Context

TokenViewer centraliza actualmente registros individuales enviados por el collector a un servidor HTTP que calcula precios, persiste uso y cuotas en SQLite y sirve agregados al dashboard. El cambio sustituye esa cadena por artefactos diarios agregados dentro de un repositorio Git, manteniendo el collector y las vistas del dashboard compatibles con granularidad diaria, pero eliminando la persistencia propia en SQLite, el backend y Docker.

El repositorio pasa a ser **público**. La garantía de escritura en `master` combina permisos de colaborador y protección de rama, no la visibilidad: actualmente `Angel-M-R` es el único colaborador y la apertura pública por sí sola no concede push a terceros. GitHub Free impide habilitar la protección mientras este repositorio es privado, así que la reescritura limpia y su push excepcional se realizan primero en privado tras verificar el acceso, y la protección se habilita inmediatamente después de abrirlo. La defensa de privacidad de los payloads de snapshots es el contrato agregado v2 y su validación de esquema cerrado; un check focalizado separado demuestra que el árbol Git público no conserva literales pre-anonimización.

El registro queda deliberadamente limitado a tres identidades macOS renombradas. `angel-mac` y `mac-m5` son las únicas publicadoras activas: cada una tendrá credenciales Git personales, ejecutará una tarea diaria con `launchd` y será la única escritora de su carpeta. `angel-mac` conserva su nombre actual por decisión explícita del propietario. `old-mac`, la Mac legacy retirada, es permanentemente de solo lectura; su carpeta sigue siendo una fuente histórica formada exclusivamente por los snapshots agregados ya importados desde SQLite. Los datos versionados no pueden contener registros individuales, desglose horario ni campos capaces de revelar prompts, conversaciones, sesiones, proyectos, rutas, credenciales, login de cuenta o payloads originales.

## Goals / Non-Goals

**Goals:**

- Producir snapshots reproducibles por máquina y fecha con agregados **diarios** de solicitudes, cinco categorías de tokens y costes por agente, proveedor y modelo.
- Definir el día de un snapshot por **día local `Europe/Madrid`**, de forma estable y reproducible.
- Calcular cada coste en memoria sobre el registro normalizado antes de incorporarlo al agregado, conservando costes facturados cuando existan y contabilizando registros sin precio.
- Reconstruir el histórico disponible y cualquier fecha ausente sin versionar datos crudos.
- Migrar de forma verificable los 310 snapshots v1 existentes al esquema v2, reagregándolos a día local y renombrando sus rutas de máquina.
- Permitir que el dashboard local consulte directamente los snapshots y conserve resumen, series diarias, calendar heatmap, desglose por modelos, cuotas y filtros compatibles con datos agregados diarios.
- Publicar con seguridad directamente en `master`, tolerar la concurrencia entre las carpetas de `angel-mac` y `mac-m5` y conservar commits no publicados para la ejecución siguiente.
- Validar localmente antes de cada commit y validar el conjunto completo en CI contra el esquema v2.
- Ejecutar un corte verificable y reversible antes de retirar servidor, Docker y la SQLite de TokenViewer, y antes de abrir el repositorio.

**Non-Goals:**

- Separar el proyecto en dos repositorios (código público y snapshots privado).
- Publicar cualquier desglose horario o precisión subdiaria.
- Anonimizar `angel-mac` o generalizar el renombrado más allá de las dos identidades pre-anonimización confirmadas.
- Convertir el check focalizado de literales prohibidos del árbol Git en un detector heurístico de privacidad de payloads; el esquema cerrado v2 sigue siendo la salvaguarda de esos datos.
- Hosting público de la aplicación, sincronización en tiempo real o acceso remoto al dashboard.
- Drill-down de registros individuales o versionado de cualquier dato crudo o identificador innecesario.
- Soporte para identidades distintas de `angel-mac`, `old-mac` y `mac-m5`, ni una plataforma de publicación genérica.
- Backfill local, publicación futura o instalación operativa para la `old-mac` retirada.
- Mantener compatibilidad de lectura con el esquema v1 después de la migración.
- Sustituir el acceso de solo lectura de los adaptadores a las bases SQLite pertenecientes a aplicaciones de terceros; se retira únicamente SQLite como almacenamiento propio de TokenViewer.
- Cambiar el diseño visual o ampliar métricas y vistas del dashboard.

## Decisions

### 1. Un fichero canónico por máquina y día local, esquema v2

Los datos vivirán bajo `snapshots/<machine>/YYYY/MM/YYYY-MM-DD.json`, donde `<machine>` puede ser `angel-mac`, `old-mac` o `mac-m5`. El contrato y el dashboard aceptarán las tres identidades; el ciclo de vida se aplicará por separado para que solo `angel-mac` y `mac-m5` puedan generar o publicar. Cada fichero tendrá `schemaVersion: 2`, identidad de máquina, fecha local, metadatos mínimos de generación, filas de uso diarias y muestras de cuota sanitizadas.

Cada fila de uso identificará únicamente la combinación `agent/provider/model`, con `requests`, las cinco categorías de tokens, coste estimado, coste facturado y recuento sin precio. **No existe campo de hora.** Las muestras de cuota contendrán únicamente proveedor, fecha de captura sin hora, porcentaje, plan y renovación. Los valores desconocidos de proveedor o modelo usarán un valor canónico explícito en vez de omitir dimensiones.

Se descarta conservar la hora: la granularidad publicada se reduce deliberadamente a día para minimizar lo que un repositorio público expone sobre horarios de trabajo. También se descarta un único fichero histórico porque crecería indefinidamente y mezclaría escritores, y se descartan registros individuales porque contradicen la privacidad confirmada.

### 2. El día se define en `Europe/Madrid`, no en UTC

La fecha de un snapshot es el **día local `Europe/Madrid`** del instante del registro. Esto arrastra tres consecuencias explícitas:

- El **día abierto** que cada ejecución regenera (`openDate`) es el día local actual en `Europe/Madrid`, no el día UTC.
- La **protección de días cerrados** se evalúa sobre esa misma definición local.
- El truncado de `quotaSamples.takenAt` produce la **fecha local**, no la fecha UTC del instante de captura.

En la migración v1→v2 la conversión de hora UTC a día local se hace **antes** de colapsar la hora, aprovechando que los ficheros v1 aún conservan la hora exacta. Este orden es obligatorio: colapsar primero y reasignar después perdería la información necesaria y desplazaría actividad de madrugada al día equivocado.

Se descarta usar UTC porque produciría cortes de día a las 02:00 hora local en verano, partiendo sesiones nocturnas reales y haciendo que el "día abierto" no coincida con el día que el usuario percibe.

### 3. Migración v1→v2 mediante herramientas temporales de un solo uso

El salto de esquema se ejecuta con herramientas temporales de migración y equivalencia de un solo uso, siguiendo el patrón ya establecido en `scripts/migration/`: módulos TypeScript, tests, configuración y scripts de raíz dedicados. La migración lee los 310 ficheros v1, reasigna cada fila horaria a su día local `Europe/Madrid`, colapsa la hora, recombina filas que caen en la misma clave `agent/provider/model` del mismo día, trunca `takenAt` a fecha local y escribe ficheros v2 en la ruta de la máquina renombrada. Una vez retenidos los informes y la evidencia de migración y equivalencia, estas herramientas y todo su soporte dedicado se eliminan antes de reescribir el historial y abrir el repositorio.

El validador acepta **solo v2**. No se implementa lectura dual ni conversión perezosa: mantener dos formas válidas del contrato multiplicaría los caminos de validación y dejaría abierta indefinidamente la posibilidad de publicar un fichero con hora. Un fichero v1 encontrado después de la migración es un fallo de validación, no un caso soportado.

### 4. Agregación local determinista con días cerrados

El collector seguirá usando los adaptadores existentes para normalizar fuentes locales, pero los registros vivirán solo en memoria. Para cada registro válido se resolverá el precio localmente y después se acumulará en su clave diaria. `recordHash` podrá usarse durante la ejecución para deduplicar, pero nunca se escribirá al snapshot.

Cada ejecución de una publicadora activa reconstruirá todas las fechas ausentes para las que aún existan fuentes y regenerará el día local abierto. Los días cerrados existentes serán inmutables en la operación normal; una reparación explícita podrá regenerarlos con validación y diff visibles. `angel-mac` procesará su histórico local disponible y `mac-m5` empezará con las fuentes disponibles cuando llegue. `old-mac` no ejecutará generación: sus snapshots ya importados, una vez migrados a v2, se aceptan como su histórico completo disponible.

Se descarta depender solo de cursores incrementales y sumar sobre ficheros previos: un estado corrupto podría duplicar agregados sin conservar hashes individuales. El estado local puede seguir optimizando descubrimiento y diagnóstico, pero la presencia y validez de los snapshots es la fuente de verdad para detectar días faltantes, y solo se confirma después de persistir y publicar con éxito.

### 5. Esquema estricto para payloads y scrub literal para el repositorio

El contrato compartido validará tanto cada fichero como el conjunto. Además de tipos y rangos, comprobará que la máquina y fecha coincidan con la ruta, que `schemaVersion` sea exactamente `2`, que no haya claves agregadas duplicadas, que contadores y costes sean finitos y no negativos, y que los totales coincidan con la suma de filas cuando existan totales derivados.

La validación rechazará claves prohibidas, incluidas variantes de prompt, conversación, sesión, proyecto, ruta, credencial, token de autenticación, login, payload original, `raw`, `sourceFile`, `recordHash` y cualquier campo de hora residual del esquema v1. Se usará un esquema cerrado para que campos nuevos no se publiquen accidentalmente. El mismo validador se ejecutará antes de escribir, antes de commit y sobre todo `snapshots/` en CI.

La validación de esquema es la salvaguarda de privacidad para los payloads de snapshots. Separadamente, el gate de CI ejecutará un check determinista de los literales exactos pre-anonimización y de la cadena del antiguo empleador sobre todo el árbol Git versionado. El check no excluirá `openspec/changes/`, informes ni herramientas temporales y no alterará `angel-mac`. Se descarta convertirlo en un detector heurístico de valores sensibles: su propósito acotado es demostrar el scrub literal completo del repositorio público.

Se descarta una lista de campos permitidos aplicada solo al final del pipeline porque una serialización intermedia o un cambio de tipo podría filtrar datos; el tipo agregado y el serializador serán sanitizados desde su frontera.

### 6. Capa local compatible para el dashboard

El dashboard descubrirá los JSON mediante imports estáticos de Vite, sin servidor ni token de dashboard. Una capa de repositorio local validará los módulos cargados y expondrá operaciones equivalentes a las consultas que consumen los hooks actuales: filtros por máquina, agente, proveedor, modelo y rango; resumen; serie diaria; calendar heatmap; modelos y cuotas.

Las agregaciones secundarias se harán en el navegador sobre filas diarias. **El heatmap horario 7×24 se retira**, junto con su parámetro de zona horaria y su conversión horaria, porque el contrato v2 ya no publica desglose por hora. El selector de métrica activa de los filtros globales se conserva y pasa a gobernar únicamente el calendar heatmap anual, que se mantiene sobre agregados diarios. Las cuotas se agruparán por cualquiera de las tres identidades de máquina y proveedor, no por login, y las cards conservarán porcentaje, plan, renovación y serie histórica diaria sin mostrar identidad de cuenta.

Se conservarán los tipos de respuesta de la capa de UI siempre que no representen registros individuales ni desglose horario, minimizando cambios en componentes. El drill-down paginado y el gate de Bearer desaparecerán porque no tienen fuente válida ni función en una ejecución exclusivamente local. Se descarta levantar un servidor local de compatibilidad porque mantendría el backend que se quiere retirar.

### 7. Publicador Git transaccional y propietario por carpeta

Cada `launchd` de `angel-mac` o `mac-m5` apuntará a un checkout o worktree operativo dedicado sobre `master`, separado de la rama de desarrollo. El publicador verificará repositorio, rama, remoto, identidad activa y árbol limpio salvo un commit pendiente propio antes de trabajar. La preflight rechazará explícitamente `old-mac`, aunque el validador del conjunto siga aceptando su carpeta histórica.

La secuencia será: recuperar primero cualquier commit pendiente; `git pull --rebase origin master`; generar solo dentro de la carpeta de la máquina; validar localmente; crear un commit de datos solo si hay diff; intentar `git push origin master`. Ante rechazo no fast-forward, hará un número limitado de ciclos `pull --rebase` y `push`. Nunca usará force-push, reset destructivo ni descartará un commit ya creado. Si agota reintentos o pierde red, finalizará con error dejando el commit para la próxima ejecución.

La preflight ya no comprueba que el remoto sea privado. Comprueba que sea el remoto esperado, que la rama sea `master` y que la identidad configurada coincida con la carpeta escrita. El control de escritura es responsabilidad de los permisos de colaborador y la protección de rama del repositorio público.

Se descarta una rama por máquina porque añade integración periódica y contradice la publicación directa confirmada. La propiedad disjunta de carpetas reduce conflictos; cualquier conflicto real detendrá la automatización para intervención en vez de resolver o sobrescribir datos automáticamente.

### 8. Reescritura privada única seguida de apertura y protección inmediatas

Antes de hacer el repositorio público se reescribe el historial con `git filter-repo`, conservando los 7 commits existentes y eliminando de cada uno todos los snapshots v1, las identidades pre-anonimización y la cadena del antiguo empleador. La reescritura solo puede comenzar después de completar la equivalencia v1→v2, conservar sus informes, terminar el scrub del árbol final y verificar la copia offline pre-reescritura. Mientras el repositorio permanece **privado y sin protección de rama**, se vuelve a comprobar que `Angel-M-R` es la única cuenta con acceso de escritura y se ejecuta exactamente un `git push --force-with-lease` manual. Este orden acota la ventana inevitable creada porque GitHub Free no permite proteger `master` en este repositorio privado.

Tras verificar el push y el historial remoto limpio, se cambia la visibilidad a pública y **de inmediato** se habilita y verifica la protección de `master`: force-push y borrado quedan deshabilitados, mientras los pushes directos ordinarios fast-forward del propietario siguen permitidos. Si la protección no puede habilitarse o verificarse después del cambio de visibilidad, la respuesta segura inmediata es restaurar la visibilidad privada si GitHub lo permite y detener obligatoriamente el corte; el repositorio no debe quedar públicamente expuesto sin el control previsto.

Esta operación es puntual y manual. **No altera la prohibición de force-push del publicador automático**, que sigue siendo absoluta: ningún camino de código del collector, del publicador o de `launchd` puede ejecutar un force-push, ni antes ni después de esta reescritura.

Se descarta empezar un repositorio nuevo sin historial porque perdería la trazabilidad de la implementación, y se descarta abrir el repositorio antes de reescribir porque el historial público quedaría permanentemente expuesto en forks y cachés.

### 9. Renombrado de identidades de alcance total

Las identidades pre-anonimización de la Mac legacy retirada y de la nueva Mac M5 se sustituyen respectivamente por `old-mac` y `mac-m5` en todo el repositorio: código, tests, fixtures, documentación, informes, specs activas de `openspec/specs/`, cambios OpenSpec activos e históricos y cualquier otro fichero versionado. El scrub preserva el hecho de que `old-mac` es histórica y de solo lectura y `mac-m5` es la nueva publicadora activa. `angel-mac` no se renombra ni se anonimiza.

Se descarta dejar el archivo de OpenSpec sin tocar: es contenido versionado y públicamente legible, y una identidad histórica dispersa entre nombres viejos y nuevos hace irrastreable qué carpeta corresponde a qué máquina.

### 10. Automatización macOS explícita para dos publicadoras activas

El repositorio incluirá una plantilla y un instalador verificable de `launchd` que materialicen un plist para `angel-mac` o `mac-m5` con ejecución diaria, directorio de trabajo operativo, PATH explícito y logs locales. La configuración no contendrá credenciales: Git reutilizará el llavero y la configuración personal existentes.

La instalación exigirá elegir una de las dos identidades activas y comprobará que coincide con la carpeta escrita. `old-mac` y cualquier nombre desconocido se rechazarán antes de crear o cargar un plist.

La instalación del job está **parada** hasta que este cambio esté implementado. El checkout operativo pre-anonimización de la nueva Mac M5 queda invalidado porque su identidad y su historial son obsoletos, y debe rehacerse desde cero como `mac-m5` después de la reescritura de historial.

### 11. CI valida datos y aplicación

Cada actualización de `master` ejecutará el validador v2 sobre todos los snapshots, pruebas unitarias del contrato, agregación, pricing, publicación y repositorio local del dashboard, además de los tests y builds aplicables del monorepo. Las pruebas focalizadas usarán fixtures de las tres identidades renombradas, demostrarán que `old-mac` es válida para lectura pero inválida para publicación o instalación, y probarán con repositorios Git temporales la carrera entre `angel-mac` y `mac-m5`, rebase, reintentos, fallo de red, ausencia de diff y conservación de commits.

CI no corrige snapshots. Además de validar el contrato v2, comprueba todo el árbol Git versionado contra la lista exacta de literales pre-anonimización y la cadena del antiguo empleador, sin exclusiones para OpenSpec, informes o herramientas temporales. Un fallo bloquea la señal de validez y requiere una reparación. Se descarta generar un manifiesto global versionado porque convertiría cada ejecución en una escritura compartida.

### 12. Corte por etapas con comparación contra el sistema actual

El backfill se desarrollará y probará en `feat/git-snapshot-migration`. Antes de retirar nada, `angel-mac` generará todo su histórico local disponible en v2. Para la `old-mac` retirada, los snapshots agregados ya importados y migrados a v2 se aceptarán como su fuente completa disponible y no se intentará backfill local. `mac-m5` no tendrá obligación de histórico legacy: deberá quedar configurada y publicar correctamente su actividad disponible cuando llegue.

La base SQLite legacy ya no existe en ninguna máquina: `apps/server/data/tokenviewer.db` no está disponible ni siquiera en modo lectura, por lo que la comprobación de equivalencia pendiente de este cambio no puede apoyarse en ella. La comparación pendiente se realiza entre los totales diarios v2 migrados y los snapshots v1 previos a la migración recuperados del historial Git, que son la única fuente de comparación restante. La comparación se realiza sobre totales diarios, ya que el contrato v2 no expone hora; el desplazamiento de frontera entre día UTC y día local `Europe/Madrid` es una diferencia esperada y documentada en los días de borde, no un mismatch, y debe demostrarse que la migración v1→v2 preservó los totales dentro de esas reasignaciones documentadas. Cualquier otra discrepancia seguirá bloqueando el corte hasta resolverse o aceptarse explícitamente. Esta comparación MUST completarse antes de reescribir el historial con `git filter-repo`, que elimina los snapshots v1. Las clasificaciones ya registradas frente a la cobertura legacy —incluidas las cinco fechas recientes de `angel-mac` que explican las 137 diferencias como adiciones esperadas— se conservan como hecho histórico ya establecido cuando la SQLite todavía existía.

La copia offline no versionada del repositorio previo a la reescritura de historial (por ejemplo un `git bundle` o clon espejo completo tomado antes del `git filter-repo`) se conservará y verificará antes de la retirada, con ubicación de restauración y comprobación de integridad documentadas y sin exponer rutas ni credenciales en snapshots. Después de validar el conjunto completo, la equivalencia y el dashboard local mediante evidencia focalizada de las tareas, todavía se esperará a que `mac-m5` llegue, quede configurada, realice una publicación válida y complete una prueba de publicación concurrente con `angel-mac` sin cambios cruzados. Solo entonces se obtendrá la aprobación de corte, se creará el tag del último sistema anterior y podrán eliminarse servidor, rutas HTTP, migraciones, Docker y dependencias SQLite propias. Los adaptadores que leen SQLite de terceros permanecerán. Después de validar el conjunto completo, la equivalencia y el dashboard local mediante evidencia focalizada de las tareas, todavía se esperará a que `mac-m5` llegue, quede configurada, realice una publicación válida y complete una prueba de publicación concurrente con `angel-mac` sin cambios cruzados. Solo entonces se obtendrá la aprobación de corte, se creará el tag del último sistema anterior y podrán eliminarse servidor, rutas HTTP, migraciones, Docker y dependencias SQLite propias. Los adaptadores que leen SQLite de terceros permanecerán.

Se descarta retirar infraestructura al comienzo porque eliminaría la referencia necesaria para comprobar el backfill y aumentaría el riesgo de pérdida histórica.

### 13. Verificación completa propiedad del verificador final

Los implementadores de tareas completarán cada unidad con cambios acotados y únicamente lint, typecheck o pruebas mínimas directamente relevantes. Ninguna tarea planificada exigirá ejecutar un build ni una suite completa del repositorio para marcarse como terminada.

Cuando todas las tareas planificadas estén completas, `openspec-verifier` será el propietario exclusivo de la aceptación final obligatoria. Ejecutará la validación completa de snapshots y privacidad, las suites completas de tests y typecheck, todos los builds aplicables y un smoke test local del dashboard. Esa aceptación confirmará carga local de las tres identidades renombradas, publicación exclusiva de las dos activas, ausencia de cualquier fichero v1 o campo de hora, el resultado registrado de equivalencia v1→v2 sobre totales diarios con sus reasignaciones de frontera de día documentadas y las adiciones esperadas ya clasificadas, ausencia de `/api/v1/*`, integridad posterior a la retirada y ausencia de hosting público de la aplicación o rutas de datos crudos. Este trabajo queda fuera del checklist de implementación y no puede bloquear la finalización de una tarea individual.

## Risks / Trade-offs

- [Un snapshot diario no permite recuperar registros individuales ni precisión subdiaria] → Es una pérdida deliberada de acuerdo con privacidad y alcance; las consultas, vistas y pruebas se ajustan a la granularidad diaria y el heatmap horario se retira.
- [El repositorio público expone permanentemente lo que se publique] → El contrato v2 es cerrado y validado, la reescritura de historial precede a la apertura, y el desglose horario desaparece antes de abrir.
- [Un error en la migración v1→v2 podría corromper los 310 snapshots existentes] → El script es de un solo uso, tiene test propio, y la validación v2 del conjunto se ejecuta antes de aceptar el resultado; los snapshots v1 previos siguen recuperables desde el historial Git hasta la reescritura, y después desde la copia offline del repositorio previo a la reescritura y el tag pre-migración.
- [La conversión UTC→día local puede desplazar actividad de madrugada] → Es el comportamiento buscado; la conversión se hace antes de colapsar la hora y los días de borde se documentan como diferencia esperada en el informe de equivalencia.
- [Un día cerrado podría recibir actividad tardía] → El día local abierto se regenera en cada ejecución y las reparaciones históricas serán explícitas, validadas y revisables.
- [La reescritura de historial invalida clones existentes] → Es exactamente un `git push --force-with-lease` manual, anunciado y ejecutado en privado tras verificar que solo el propietario tiene escritura; el checkout operativo de `mac-m5` se rehace desde cero y ningún camino automático puede repetir la operación.
- [GitHub Free no permite proteger `master` mientras el repositorio es privado] → La reescritura y el único push excepcional ocurren antes de la apertura con acceso de escritura limitado al propietario; después se hace público y se habilita/verifica la protección inmediatamente. Un fallo obliga a restaurar la visibilidad privada si es posible y a detener el corte.
- [Los pushes directos de `angel-mac` y `mac-m5` pueden competir] → Carpetas disjuntas, checkout dedicado, `pull --rebase`, reintentos limitados y conservación del commit pendiente.
- [Una credencial Git o la red puede fallar durante días] → `launchd` deja logs, el comando devuelve error y el commit local se conserva para reintento posterior.
- [Un scrub incompleto expondría identidades pre-anonimización en el repositorio público] → CI escanea todo el árbol Git versionado contra los literales exactos prohibidos sin excluir OpenSpec, informes ni herramientas temporales; el esquema cerrado v2 mantiene separadamente la privacidad de los payloads.
- [El renombrado incompleto dejaría rutas o fixtures inconsistentes] → El alcance es explícitamente total, incluido `openspec/changes/archive/`, y la validación de rutas del contrato falla ante cualquier identidad desconocida.
- [El repositorio puede crecer con el histórico] → Partición diaria y agregación diaria limitan el volumen; CI podrá vigilar tamaño y número de filas sin introducir compactación prematura.
- [Cambios del catálogo de precios pueden alterar reconstrucciones] → Los días publicados permanecen inmutables por defecto y cada snapshot registra metadatos no sensibles suficientes para auditar su generación.
- [La retirada de SQLite puede confundirse con las SQLite de aplicaciones fuente] → Las tareas de eliminación distinguirán explícitamente almacenamiento propio del acceso read-only de adaptadores.
- [La identidad histórica podría habilitarse accidentalmente como publicadora] → Registro con ciclos de vida separados y rechazo focalizado de `old-mac` en configuración, preflight e instalación, sin excluirla del validador ni del dashboard.
- [La cobertura local puede superar la cobertura de SQLite] → Ya resuelto en la clasificación registrada mientras la SQLite existía: las fechas exteriores quedaron clasificadas como adiciones esperadas; la comprobación pendiente compara v1 contra v2 sobre el mismo conjunto migrado, sin cobertura divergente.
- [La SQLite legacy ya no existe y no puede usarse como referencia de equivalencia] → La comprobación pendiente se apoya en los snapshots v1 recuperados del historial Git y MUST ejecutarse antes del `git filter-repo` que los elimina; el orden queda explícito en las tareas 9.6 y 10.4.
- [La documentación de instalación no permite un clon nuevo funcional] → `docs/macos-snapshot-publisher.md` pasa de `pnpm install` directo a `init`, pero el collector importa `@tokenviewer/core` por su `dist/`, así que falta un `pnpm build` intermedio; además el job diario ejecuta el publicador tras `git pull --rebase` sin recompilar, por lo que `dist/` puede quedar obsoleto. Ambos puntos se corrigen en la documentación y en el job antes de reanudar la instalación.

## Migration Plan

1. Implementar contrato v2, validador, agregador diario, pricing local y generación por día local `Europe/Madrid` en la rama `feat/git-snapshot-migration`, sin cambiar aún la operación de producción.
2. Implementar las herramientas temporales de migración v1→v2 y equivalencia, con sus tests, configuración y scripts de raíz dedicados, convirtiendo hora UTC a día local antes de colapsar la hora.
3. Ejecutar la migración sobre los 310 snapshots existentes, renombrar sus rutas de máquina a `old-mac` y validar el conjunto resultante contra el esquema v2.
4. Aplicar el renombrado de identidades a todo el repositorio, incluidos código, tests, fixtures, docs, informes, `openspec/specs/` y cambios OpenSpec activos e históricos, sin alterar `angel-mac`.
5. Retirar el heatmap horario y su conversión de zona horaria, conservando el selector de métrica que gobierna el calendar heatmap anual; implementar el repositorio local del dashboard y comprobar las vistas y filtros restantes contra fixtures y snapshots v2 reales.
6. Adaptar publicación Git, pruebas de concurrencia, CI e instalación `launchd` a `angel-mac` y `mac-m5`, rechazando `old-mac` en rutas operativas y retirando la comprobación de remoto privado.
7. Crear y verificar la copia offline no versionada del repositorio previo a la reescritura de historial, aceptar los snapshots migrados como histórico completo de `old-mac`, completar el backfill local de `angel-mac` y no exigir histórico legacy a `mac-m5`.
8. Validar esquema v2, privacidad e invariantes del conjunto; comparar sobre totales diarios los snapshots v2 migrados contra los snapshots v1 recuperados del historial Git; clasificar y documentar los desplazamientos de frontera de día como esperados; validar el dashboard local mediante comprobaciones focalizadas. Este paso MUST completarse antes del paso 11.
9. Retener los informes y la evidencia de migración/equivalencia; después eliminar las herramientas temporales de un solo uso y su soporte dedicado, reescribir todo contenido versionado que aún contenga literales pre-anonimización y hacer que CI escanee el árbol Git completo sin exclusiones.
10. Corregir `docs/macos-snapshot-publisher.md` añadiendo el `pnpm build` previo a `init` y garantizar que el job diario recompile tras `git pull --rebase`.
11. Mientras el repositorio sigue privado, verificar los colaboradores y accesos de escritura actuales y confirmar que solo `Angel-M-R` tiene admin/push; no exigir protección de rama privada, que GitHub Free no permite en este caso.
12. Reescribir los 7 commits con `git filter-repo` —solo después de completar equivalencia, scrub del árbol final y copia offline— para eliminar todo snapshot v1 y todos los literales pre-anonimización, verificar el historial limpio y, todavía en privado y sin protección, ejecutar exactamente un `git push --force-with-lease` manual.
13. Verificar el historial remoto limpio y validar de nuevo el conjunto completo contra esquema v2; después cambiar la visibilidad a pública e inmediatamente habilitar y verificar en `master` la protección que deshabilita force-push y borrado pero permite pushes directos fast-forward ordinarios del propietario. Si la protección falla, restaurar de inmediato la visibilidad privada si es posible y detener obligatoriamente el corte.
14. Rehacer el checkout operativo de `mac-m5` desde el repositorio reescrito, esperar la llegada de la máquina, configurarla y verificar su primera publicación; reanudar y activar `launchd` únicamente para las dos identidades activas.
15. Observar al menos una ejecución diaria y una publicación concurrente satisfactoria de `angel-mac` y `mac-m5`, sin cambios cruzados ni publicación de `old-mac`, antes de retirar backend, almacenamiento SQLite propio, Docker, autenticación y contratos HTTP.
16. Crear el tag del último sistema anterior una vez fijado el punto de reversión y antes de eliminar componentes.
17. Una vez completadas todas las tareas planificadas, encargar a `openspec-verifier` la aceptación final obligatoria con validaciones, suites completas, typecheck, builds y smoke test local.

Rollback: detener o descargar los jobs de `launchd`, conservar los snapshots ya publicados, restaurar el código desde el tag y recuperar el estado anterior desde la copia offline no versionada del repositorio previo a la reescritura. Tras la apertura del repositorio, el rollback de datos no reescribirá `master` ni hará force-push; la única reescritura autorizada es la puntual y manual previa a hacer el repositorio público.

## Open Questions

No quedan decisiones de alcance abiertas. Las rutas locales concretas del checkout operativo rehecho y de los logs de `launchd` se resolverán durante la instalación en cada Mac sin alterar el contrato, la identidad ni la política de datos.
