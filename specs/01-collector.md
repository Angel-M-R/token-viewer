# Spec 01 — Collector (`apps/collector` + `packages/adapters`)

## Objetivo

CLI Node para `angel-mac` y `mac-m5` que lee fuentes locales, deduplica registros en memoria, calcula costes, agrega por día local `Europe/Madrid`, escribe snapshots v2 y opcionalmente los publica con Git. `old-mac` es histórica y se rechaza como identidad operativa.

## Adaptadores read-only

Los adaptadores normalizan fuentes JSON, JSONL o SQLite de aplicaciones de terceros a `UsageRecord`. El soporte SQLite multi-driver (`node:sqlite` y fallback `better-sqlite3`) abre las fuentes en modo read-only y puede copiar una base bloqueada a un directorio temporal para leerla sin modificar la original.

Los registros individuales, hashes, sesiones, proyectos y rutas existen solo durante el procesamiento y nunca se serializan en un snapshot.

## Generación incremental

- El estado local registra cursores y la última ejecución fuera del repositorio.
- La carpeta de snapshots validada es la fuente de verdad para detectar días ausentes.
- Cada ejecución reconstruye días ausentes y regenera el día local abierto.
- Los días cerrados permanecen inmutables salvo reparación explícita y revisada.
- Un fallo de validación o publicación conserva el estado confirmado y cualquier commit pendiente.

## Configuración

La configuración local requiere:

- `machineName`: `angel-mac` o `mac-m5`.
- `checkoutPath`: checkout operativo dedicado en `master`.
- `expectedRemoteUrl`: remoto público esperado, sin credenciales embebidas.
- `agents`: adaptadores seleccionados; vacío o ausente autodetecta.

No existen URL de servidor, token de máquina ni credenciales Git dentro de la configuración.

## Comandos principales

| Comando | Función |
|---|---|
| `tokenviewer-collector init` | Guarda identidad activa, checkout y remoto esperado |
| `tokenviewer-collector run` | Genera y valida snapshots locales |
| `tokenviewer-collector run --dry-run` | Previsualiza únicamente agregados sin escribir ni ejecutar Git |
| `tokenviewer-collector run --full` | Reescanea todas las fuentes disponibles respetando días cerrados |
| `tokenviewer-collector run --publish` | Ejecuta generación y publicación Git segura |
| `tokenviewer-collector status` | Informa cobertura, días ausentes y commit pendiente |

## Publicación

El publicador recupera primero un commit pendiente, ejecuta `git pull --rebase origin master`, genera y valida el conjunto completo, crea un commit solo de la carpeta propia y hace un push ordinario. Los reintentos no fast-forward son limitados. Nunca usa force-push, reset destructivo ni descarta commits creados.

## Criterios de aceptación

- Las dos identidades activas escriben exclusivamente en su carpeta.
- `old-mac` falla antes de escanear, escribir, ejecutar Git o instalar un job.
- Las bases SQLite de terceros se leen sin escritura.
- El mismo input produce serialización determinista y no crea commits vacíos.
- Un fallo de red conserva el commit para la siguiente ejecución.
