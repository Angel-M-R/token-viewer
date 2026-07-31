## Why

TokenViewer depende hoy de un servidor, Docker y SQLite para centralizar datos que consultan localmente dos Macs activas, además del histórico de una máquina retirada. Sustituir esa infraestructura por snapshots diarios agregados y versionados reduce la operación sin perder el histórico, las métricas ni las vistas locales del dashboard. El repositorio pasa a ser público: el control de quién publica en `master` se resuelve con permisos de colaborador y, en cuanto GitHub Free lo permite tras la apertura, protección de rama, no con la visibilidad del repositorio; la privacidad de los datos se garantiza exclusivamente por el contrato agregado y su validación de esquema.

## What Changes

- **BREAKING** Se retiran el backend HTTP, su autenticación, Docker y SQLite después de validar un snapshot completo; el dashboard pasa a consumir exclusivamente snapshots locales del repositorio.
- **BREAKING** La granularidad de los agregados pasa de horaria a **diaria**. El día de un snapshot se define por **día local `Europe/Madrid`**, no por día UTC.
- **BREAKING** `SNAPSHOT_SCHEMA_VERSION` sube a `2` y el validador acepta **solo v2**. Herramientas temporales de un solo uso convierten los ficheros v1 a v2 y demuestran su equivalencia; después de conservar los informes y la evidencia, esas herramientas, sus tests, configuración y scripts de raíz se eliminan antes de abrir el repositorio.
- El repositorio se hace **público** solo después de una reescritura limpia y un único `git push --force-with-lease` mientras todavía es privado. Como GitHub Free no permite proteger esta rama mientras el repositorio es privado, primero se verifica que `Angel-M-R` es el único colaborador con acceso de escritura; tras la apertura se habilita y verifica inmediatamente la protección de `master`.
- Las identidades pre-anonimización de la Mac legacy retirada y de la nueva Mac M5 se sustituyen respectivamente por `old-mac` y `mac-m5` en todo el repositorio público. `angel-mac` conserva su nombre actual por decisión explícita. Siguen siendo tres identidades: dos publicadoras activas (`angel-mac`, `mac-m5`) y una histórica de solo lectura (`old-mac`).
- Los 310 snapshots v1 existentes se reagregan a granularidad diaria, se renombran sus rutas de máquina y se reescribe el historial Git con `git filter-repo` (conservando los 7 commits existentes) antes de publicar el repositorio.
- El collector calcula costes por registro localmente, agrega uso por día local, máquina, agente, proveedor y modelo, y versiona únicamente métricas agregadas particionadas por máquina y fecha.
- Se publican agente, proveedor, modelo, requests, tokens y coste. No se publica ningún desglose por hora.
- `angel-mac` y la nueva `mac-m5` reconstruyen su histórico disponible y los días faltantes, validan esquema e invariantes, modifican solo su carpeta y publican directamente en `master` mediante `pull --rebase`, reintentos limitados y sin force-push.
- La Mac legacy retirada, representada públicamente como `old-mac`, queda de solo lectura: sus snapshots agregados ya importados desde SQLite constituyen todo su histórico disponible; no se exige ni permite backfill local, publicación futura ni instalación de `launchd` para esa identidad.
- `launchd` ejecuta diariamente la generación y publicación únicamente en `angel-mac` y `mac-m5`, usando las credenciales Git personales existentes.
- Las cuotas conservan porcentaje, plan, renovación e histórico, pero eliminan login y payload original de los datos versionados, y `takenAt` se recorta a fecha local sin hora.
- Se preservan las vistas y filtros del dashboard compatibles con granularidad diaria en ejecución local, sin hosting público de la aplicación ni datos en tiempo real; se retira el heatmap horario.
- CI valida el conjunto completo de snapshots contra el esquema v2, ejecuta las pruebas y builds aplicables y aplica un check focalizado de literales prohibidos sobre todo el árbol final versionado, sin excluir OpenSpec ni herramientas temporales. El esquema cerrado sigue siendo la defensa de privacidad de los payloads de snapshots; el check de árbol garantiza separadamente que no sobrevivan las identidades pre-anonimización ni la cadena del antiguo empleador.
- La migración se desarrolla en una rama nueva, conserva un tag del sistema anterior y una copia offline no versionada del repositorio previo a la reescritura de historial (por ejemplo un `git bundle` o clon espejo completo), reescribe y publica el historial una sola vez mientras el repositorio permanece privado y solo después lo hace público y protege `master` de inmediato. Solo retira el sistema anterior después de que `mac-m5` llegue, quede configurada, publique con éxito y se verifique su publicación concurrente con `angel-mac`.
- La base SQLite legacy ya no existe en ninguna máquina, por lo que la comprobación de equivalencia pendiente de este cambio compara los totales diarios v2 migrados contra los snapshots v1 previos a la migración recuperados del historial Git, clasificando los desplazamientos de frontera de día UTC a `Europe/Madrid` como diferencias esperadas y documentadas. Esa comparación MUST completarse antes de reescribir el historial con `git filter-repo`, que elimina la única fuente de comparación restante. Las clasificaciones de adiciones esperadas ya registradas frente a la cobertura legacy se conservan como hecho histórico.
- Quedan fuera de alcance los registros individuales, prompts, conversaciones, sesiones, proyectos, rutas, credenciales, datos crudos, identificadores innecesarios y la generalización a identidades distintas de `angel-mac`, `old-mac` y `mac-m5`.

## Non-Goals

- No se separa el repositorio en dos (código público / snapshots privado).
- No se publica desglose horario.
- No se anonimiza `angel-mac`.
- No se generaliza el check focalizado de literales prohibidos a un detector heurístico de datos sensibles; la privacidad de los payloads sigue dependiendo del esquema cerrado v2.

## Capabilities

### New Capabilities

- `snapshot-data-contract`: Define el esquema versionado v2, particionado, agregado diario y privado para uso y cuotas.
- `git-snapshot-publishing`: Define generación diaria, reconstrucción, validación, publicación concurrente y automatización con `launchd` para las dos identidades activas, rechazando la identidad histórica.
- `local-snapshot-dashboard`: Define la carga y consulta local de snapshots preservando las vistas y filtros compatibles con granularidad diaria sin backend.
- `snapshot-migration-cutover`: Define backfill, migración v1→v2, reescritura de historial, apertura del repositorio, validación de equivalencia, retirada reversible del sistema anterior y salvaguardas de migración.

### Modified Capabilities

- `collector-cli`: Sustituye registro y envío al servidor por generación, validación y publicación local de snapshots diarios.
- `incremental-scanning`: Cambia la confirmación del destino, usa el día local `Europe/Madrid` y añade reconstrucción automática de días faltantes e histórico completo.
- `usage-ingestion`: Sustituye ingesta HTTP y persistencia de registros individuales por procesamiento local agregado diario.
- `machine-registry`: Sustituye alta y tokens de servidor por tres identidades fijas renombradas, separando las publicadoras activas `angel-mac` y `mac-m5` de la histórica y de solo lectura `old-mac`.
- `pricing-engine`: Traslada el cálculo de costes al collector antes de agregar por día y elimina la dependencia de persistencia y repricing del servidor.
- `copilot-quota-collection`: Sustituye el envío al servidor por snapshots locales sanitizados y agregados con `takenAt` recortado a fecha.
- `quota-snapshots`: Sustituye la tabla y el payload original por ficheros históricos sin login ni datos crudos y con fecha sin hora.
- `quota-dashboard`: Elimina la identificación visual por login y adapta la cuota al contrato sanitizado conservando porcentaje, plan, renovación e histórico diario.
- `stats-api`: Sustituye endpoints HTTP y drill-down individual por consultas locales sobre agregados diarios, manteniendo métricas y filtros compatibles con el dashboard.
- `global-filters`: Conserva el selector de métrica activa, que pasa a gobernar solo el calendar heatmap anual tras retirarse el heatmap horario, y ajusta los multiselects a las identidades renombradas y a la ausencia de API.
- `docker-deployment`: Retira la imagen, compose, servidor y persistencia SQLite tras el corte validado.

### Removed Capabilities

- `hourly-heatmap`: Se retira el heatmap 7×24 y su conversión de zona horaria porque el contrato v2 ya no publica desglose horario. El calendar heatmap anual, hoy definido dentro de esta capability, se traslada a `local-snapshot-dashboard` sobre agregados diarios.

## Impact

- Afecta al collector, contratos compartidos, pricing, cuotas, acceso a datos del dashboard, servidor, Docker, SQLite, scripts operativos, CI y documentación de ejecución local.
- Cambia de forma incompatible los contratos HTTP actuales, el esquema de snapshot (v1→v2) y la granularidad publicada, y elimina el drill-down de registros individuales y el heatmap horario de acuerdo con la política de privacidad.
- El renombrado de identidades alcanza todo el repositorio: código, tests, fixtures, docs, informes, artefactos OpenSpec activos e históricos y cualquier otro contenido versionado. El árbol final público no conserva las identidades pre-anonimización ni la cadena del antiguo empleador.
- Introduce ficheros de snapshots versionados v2, esquemas de validación, herramientas temporales de migración y equivalencia que se retiran tras conservar su evidencia, automatización `launchd` y coordinación Git directa sobre `master` por carpeta de máquina.
- La reescritura de historial con `git filter-repo` y exactamente un `git push --force-with-lease` manual son una operación puntual ejecutada mientras el repositorio sigue privado, sin protección de rama por la limitación de GitHub Free y después de verificar que solo `Angel-M-R` tiene escritura. Tras el push limpio, el repositorio se hace público y se protege `master` inmediatamente; si la protección falla, se restaura la visibilidad privada si es posible y el corte se detiene obligatoriamente. Esta excepción **no** altera la prohibición de force-push del publicador automático.
- El checkout operativo pre-anonimización de la nueva Mac M5 queda invalidado por identidad e historial obsoletos y debe rehacerse como `mac-m5` tras el cambio. La instalación del job `launchd` permanece parada hasta que este cambio esté implementado.
- Requiere aceptar los snapshots ya importados desde la SQLite legacy como histórico completo de `old-mac`, verificar la equivalencia v1→v2 contra los snapshots v1 recuperados del historial Git antes de reescribirlo, incorporar y validar `mac-m5`, y completar publicación concurrente de las dos identidades activas antes de retirar componentes, además de tag previo y copia offline no versionada del repositorio previo a la reescritura para reversión.
