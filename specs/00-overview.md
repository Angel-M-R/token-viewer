# TokenViewer — Visión general

## Propósito

TokenViewer agrega localmente el uso de agentes de IA y lo visualiza en un dashboard local. No existe un backend de TokenViewer: dos Macs activas generan snapshots diarios agregados, los validan y los publican en el repositorio Git público. El dashboard carga esos snapshots directamente desde su checkout.

## Decisiones cerradas

| Decisión | Elección |
|---|---|
| Fuente de datos | Logs locales de cada agente; Copilot aporta únicamente cuota sanitizada |
| Identidades | `angel-mac` y `mac-m5` publican; `old-mac` conserva histórico de solo lectura |
| Persistencia | Snapshots JSON v2 bajo `snapshots/<machine>/YYYY/MM/YYYY-MM-DD.json` |
| Granularidad | Día local `Europe/Madrid`; no se publica hora ni dato individual |
| Sincronización | Publicación Git directa y fast-forward a `master`, con protección de rama |
| Interfaz | Dashboard React/Vite ejecutado solo en local |
| Precios | Catálogo de models.dev y fallbacks resueltos por el collector antes de agregar |

## Arquitectura

```text
angel-mac / mac-m5
  adapters read-only -> collector -> aggregate schema v2 -> validate
                                            |
                                            v
                         snapshots/<machine>/YYYY/MM/YYYY-MM-DD.json
                                            |
                         pull --rebase / commit / push protected master
                                            |
                                            v
                    local React dashboard loads repository snapshots

old-mac -> historical snapshots only (no collector, publisher, or launchd job)
```

Los adaptadores pueden leer bases SQLite pertenecientes a aplicaciones de terceros en modo read-only. TokenViewer no posee una base de datos, servidor, API de ingesta, contenedor ni hosting de aplicación.

## Estructura del monorepo

```text
tokenViewer/
├── apps/
│   ├── collector/       # generación, validación y publicación Git
│   └── web/             # dashboard local React + Vite
├── packages/
│   ├── core/            # contrato v2, validación y pricing local
│   └── adapters/        # fuentes locales read-only
├── snapshots/           # datos diarios agregados de las tres identidades
├── ops/macos/           # jobs diarios para las dos identidades activas
├── scripts/ci/          # políticas y validación de snapshots
├── docs/                # operación, recuperación y rollback
└── specs/               # arquitectura vigente
```

## Operación

- Cada publicador activo usa un checkout dedicado y limpio de `master`.
- Cada identidad solo puede modificar su propia carpeta; `old-mac` se rechaza antes de generar o ejecutar Git.
- Todo snapshot debe declarar `schemaVersion: 2`, carecer de campo horario y pasar el esquema cerrado de privacidad.
- `master` permite los pushes fast-forward ordinarios del propietario, pero no force-push ni borrado.
- La aceptación completa de suites, typecheck y builds pertenece a la verificación final de OpenSpec.
