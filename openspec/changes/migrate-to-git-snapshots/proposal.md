## Why

TokenViewer depende hoy de un servidor, Docker y SQLite para centralizar datos que consultan localmente dos Macs activas, además del histórico de una máquina retirada. Sustituir esa infraestructura por snapshots diarios agregados, privados y versionados reduce la operación sin perder el histórico, las métricas ni las vistas locales del dashboard.

## What Changes

- **BREAKING** Se retiran el backend HTTP, su autenticación, Docker y SQLite después de validar un snapshot completo; el dashboard pasa a consumir exclusivamente snapshots locales del repositorio privado.
- El collector calcula costes por registro localmente, agrega uso por hora, máquina, agente, proveedor y modelo, y versiona únicamente métricas agregadas particionadas por máquina y fecha.
- `angel-mac` y la nueva `mac-m5` reconstruyen su histórico disponible y los días faltantes, validan esquema e invariantes, modifican solo su carpeta y publican directamente en `master` mediante `pull --rebase`, reintentos limitados y sin force-push.
- La `old-mac` original queda retirada y de solo lectura: sus snapshots agregados ya importados desde SQLite constituyen todo su histórico disponible; no se exige ni permite backfill local, publicación futura ni instalación de `launchd` para esa identidad.
- `launchd` ejecuta diariamente la generación y publicación únicamente en `angel-mac` y `mac-m5`, usando las credenciales Git personales existentes.
- Las cuotas conservan porcentaje, plan, renovación e histórico, pero eliminan login y payload original de los datos versionados.
- Se preservan todas las vistas y filtros actuales del dashboard en ejecución local, sin hosting público ni datos en tiempo real.
- CI valida el conjunto completo de snapshots y ejecuta las pruebas y builds aplicables.
- La migración se desarrolla en una rama nueva, conserva un tag del sistema anterior y una copia offline no versionada de SQLite, y solo retira el sistema anterior después de que `mac-m5` llegue, quede configurada, publique con éxito y se verifique su publicación concurrente con `angel-mac`.
- La equivalencia compara estrictamente la cobertura solapada con SQLite; las fechas válidas de fuente local fuera de la cobertura legacy se clasifican como adiciones esperadas, sin ocultar discrepancias dentro del solapamiento.
- Quedan fuera de alcance los registros individuales, prompts, conversaciones, sesiones, proyectos, rutas, credenciales, datos crudos, identificadores innecesarios y la generalización a identidades distintas de `angel-mac`, `old-mac` y `mac-m5`.

## Capabilities

### New Capabilities

- `snapshot-data-contract`: Define el esquema versionado, particionado, agregado y privado para uso y cuotas.
- `git-snapshot-publishing`: Define generación diaria, reconstrucción, validación, publicación concurrente y automatización con `launchd` para las dos identidades activas, rechazando la identidad histórica.
- `local-snapshot-dashboard`: Define la carga y consulta local de snapshots preservando las vistas y filtros actuales sin backend.
- `snapshot-migration-cutover`: Define backfill, validación de equivalencia, retirada reversible del sistema anterior y salvaguardas de migración.

### Modified Capabilities

- `collector-cli`: Sustituye registro y envío al servidor por generación, validación y publicación local de snapshots.
- `incremental-scanning`: Cambia la confirmación del destino y añade reconstrucción automática de días faltantes e histórico completo.
- `usage-ingestion`: Sustituye ingesta HTTP y persistencia de registros individuales por procesamiento local agregado.
- `machine-registry`: Sustituye alta y tokens de servidor por tres identidades fijas, separando las publicadoras activas `angel-mac` y `mac-m5` de la histórica y de solo lectura `old-mac`.
- `pricing-engine`: Traslada el cálculo de costes al collector antes de agregar y elimina la dependencia de persistencia y repricing del servidor.
- `copilot-quota-collection`: Sustituye el envío al servidor por snapshots locales sanitizados y agregados.
- `quota-snapshots`: Sustituye la tabla y el payload original por ficheros históricos sin login ni datos crudos.
- `quota-dashboard`: Elimina la identificación visual por login y adapta la cuota al contrato sanitizado conservando porcentaje, plan, renovación e histórico.
- `stats-api`: Sustituye endpoints HTTP y drill-down individual por consultas locales sobre agregados, manteniendo métricas y filtros compatibles con el dashboard.
- `docker-deployment`: Retira la imagen, compose, servidor y persistencia SQLite tras el corte validado.

## Impact

- Afecta al collector, contratos compartidos, pricing, cuotas, acceso a datos del dashboard, servidor, Docker, SQLite, scripts operativos, CI y documentación de ejecución local.
- Cambia de forma incompatible los contratos HTTP actuales y elimina el drill-down de registros individuales de acuerdo con la política de privacidad.
- Introduce ficheros de snapshots versionados, esquemas de validación, automatización `launchd` y coordinación Git directa sobre `master` por carpeta de máquina.
- Requiere aceptar los snapshots SQLite ya importados como histórico completo de `old-mac`, clasificar equivalencia por cobertura, incorporar y validar `mac-m5`, y completar publicación concurrente de las dos identidades activas antes de retirar componentes, además de tag previo y copia offline de la base de datos para reversión.
