## Context

La migración a snapshots Git está archivada sin sincronizar sus deltas. El working tree ya contiene eliminaciones pendientes de `apps/server`, Docker y herramientas de migración, además de cambios de configuración y documentación; las specs principales todavía describen la arquitectura anterior. El dashboard vigente ya carga snapshots v2 directamente y debe conservar exactamente su experiencia visible.

Este cambio solo completa y hace coherente la limpieza versionada. Los artefactos históricos de OpenSpec, el historial Git, las imágenes y bases locales, y cualquier artefacto ignorado quedan fuera de alcance.

## Goals / Non-Goals

**Goals:**

- Dejar el árbol activo sin Docker, `apps/server`, API, autenticación, migraciones ni SQLite propia de TokenViewer.
- Dejar un único contrato activo de snapshots v2, sin compatibilidad, conversión, fixtures ni tests dedicados a snapshots v1.
- Dejar `collector-state.json` con un contrato interno estricto y no versionado; el estado anterior con `schemaVersion = 1` se invalida y fuerza un escaneo completo por el camino de warning existente.
- Conservar el acceso SQLite read-only requerido por adaptadores de aplicaciones de terceros.
- Mantener el dashboard local v2 sin cambios visibles.
- Reconciliar las specs principales mediante este cambio nuevo, sin modificar historia archivada.
- Obtener exit 0 con tests, typecheck y build existentes y comprobar el estado versionado.

**Non-Goals:**

- Limpiar imágenes Docker, bases de datos, builds, caches o artefactos locales no versionados.
- Modificar `openspec/changes/archive/**`, reescribir historial o sincronizar retroactivamente el cambio archivado.
- Añadir un guard CI, una suite de integridad nueva o tests/fixtures negativos para snapshots v1.
- Cambiar vistas, filtros, estilos, métricas o interacción del dashboard.
- Refactorizar adaptadores, publicación Git, jobs operativos u otras áreas adyacentes.
- Añadir conversión, compatibilidad, limpieza de ficheros locales o tooling de migración para el formato anterior de `collector-state.json`.

## Decisions

### 1. El límite de eliminación es el árbol activo versionado

Se eliminarán las rutas `apps/server/**`, `docker/**`, `.dockerignore`, migraciones propias y sus referencias activas en manifests, lockfile, scripts, configuración, CI y documentación. La inspección final se basará en archivos versionados. No se ejecutarán comandos de Docker ni se tocarán bases o artefactos locales.

**Alternativa descartada:** limpiar también la máquina local. Contradice el alcance confirmado y no es necesario para definir el estado del repositorio.

### 2. El contrato de snapshots queda expresado únicamente en v2

`SNAPSHOT_SCHEMA_VERSION = 2`, el esquema cerrado, el validador normal y los fixtures positivos v2 permanecen. Se eliminan rutas de conversión, compatibilidad, detección especializada de legado y casos de test construidos como documentos snapshot v1. El validador ordinario seguirá rechazando cualquier documento que no cumpla el esquema v2, sin mantener un camino o fixture específico para una versión anterior.

**Alternativa descartada:** conservar tests negativos o mensajes especializados de v1. Aunque no ofrecen compatibilidad, mantienen una representación activa del contrato retirado y contradicen la limpieza solicitada.

### 3. El estado interno del collector deja de estar versionado

El contrato interno de `collector-state.json` deja de tener versión. El tipo, el estado vacío y todos los productores omiten `schemaVersion`; el validador cerrado acepta únicamente `files`, `lastRunAt` y `pendingPublicationCommit` con sus tipos vigentes. Un fichero que todavía declare `schemaVersion = 1`, o cualquier otra propiedad desconocida, sigue el camino ordinario de estado inválido/desconocido: se emite el warning existente, se usa estado vacío y la ejecución realiza un escaneo completo. El fichero local no se convierte ni se elimina y no se añade compatibilidad ni tooling de migración.

**Alternativa descartada:** incrementar el estado a v2 o aceptar temporalmente ambas formas. Mantendría versionado o compatibilidad en un contrato puramente interno que debe quedar sin versiones.

### 4. No se crea ni conserva un guard CI de retirada

El test `post-retirement` pendiente, su script raíz, su inclusión TypeScript y su paso de workflow no forman parte del resultado. La cobertura final usa los comandos existentes de tests, typecheck, build y validación de snapshots, más una inspección explícita de archivos versionados.

**Alternativa descartada:** añadir un test permanente que prohíba rutas retiradas. Es un guard CI nuevo, expresamente fuera de alcance.

### 5. El dashboard se protege por preservación y validación, no por rediseño

La capa local, componentes y contratos v2 existentes se mantienen. Solo se eliminan referencias obsoletas al backend y se ejecutan los tests existentes, typecheck y build; la inspección final confirma que la aplicación sigue siendo local y que no reaparecen superficies retiradas.

**Alternativa descartada:** aprovechar la limpieza para simplificar hooks, componentes o tipos. Aumentaría el riesgo de cambios visibles y sería un refactor adyacente.

### 6. Las specs activas se corrigen con deltas nuevos

Este cambio añade las capacidades activas `snapshot-data-contract` y `local-snapshot-dashboard`, y modifica o retira requisitos obsoletos de las capacidades principales existentes. El cambio archivado se usa solo como contexto de lectura y permanece inmutable.

**Alternativa descartada:** editar o sincronizar el archivo de migración. Reescribiría historia y contradice la decisión explícita de archivarlo sin sync.

## Risks / Trade-offs

- [Una referencia obsoleta puede quedar fuera de las rutas evidentes] → Inspeccionar todos los archivos versionados activos después de los cambios, excluyendo únicamente historia explícita.
- [Eliminar dependencias SQLite puede romper adaptadores] → Retirar solo la propiedad de almacenamiento de TokenViewer y confirmar que `better-sqlite3` permanece únicamente donde lo requieren adaptadores read-only.
- [Eliminar tests v1 puede reducir evidencia negativa específica] → El esquema cerrado v2 y la validación completa del conjunto siguen cubriendo el único contrato soportado, sin mantener artefactos de la versión retirada.
- [El estado local anterior deja de validar] → Es una incompatibilidad intencional y segura: el warning existente hace visible la causa y el estado vacío obliga a reconstruir cursores mediante un escaneo completo sin modificar el fichero anterior durante la carga.
- [Cambios de lockfile o workspace pueden afectar el build] → Regenerar solo lo necesario y exigir test, typecheck y build completos con exit 0.
- [La reconciliación de muchas specs puede mezclarse con implementación] → Mantener los deltas centrados en el estado final ya decidido y no tocar el archivo histórico.

## Migration Plan

1. Confirmar y completar las eliminaciones versionadas de Docker, `apps/server`, migraciones y SQLite propia, conservando adaptadores read-only.
2. Limpiar manifests, lockfile, scripts, configuración, CI y documentación activa; retirar el guard `post-retirement` pendiente.
3. Simplificar el contrato y tests para que solo representen snapshots v2, sin conversión, fixtures ni casos v1.
4. Retirar `schemaVersion` del tipo, validador y productores de `collector-state.json`, hacer estricto el validador y cubrir que el estado anterior se rechaza por el camino de warning y escaneo completo sin migración ni limpieza.
5. Preservar la capa y UI del dashboard; realizar únicamente ajustes de referencias necesarios para compilar.
6. Ejecutar las validaciones existentes y la inspección de archivos versionados como aceptación terminal.

Rollback: restaurar los archivos versionados desde Git o desde el tag histórico existente; no se requiere restauración ni limpieza de estado local porque este cambio no lo modifica.

## Open Questions

No quedan decisiones abiertas; el Brief confirmado fija alcance, exclusiones y método de validación.
