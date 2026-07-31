# Spec 04 — Cuota de Copilot

## Fuente local best-effort

GitHub Copilot no expone contadores de tokens en logs locales, por lo que el collector consulta como máximo una vez por ejecución `copilot_internal/user` cuando existe un token OAuth local. El login por device flow guarda ese token fuera del repositorio con permisos restrictivos.

Un fallo de red, API o token solo genera un aviso y no bloquea los agregados de uso.

## Sanitización

La respuesta se reduce inmediatamente a:

- `provider`
- `takenAt` como fecha local `Europe/Madrid` sin hora
- `percentUsed`
- `plan`
- `resetsAt`

Login, identidad de cuenta, credenciales, campos desconocidos y payload original se descartan antes de construir el snapshot.

## Dashboard

El dashboard agrupa por máquina y proveedor, deduplica muestras equivalentes por fecha y muestra porcentaje reciente, plan, renovación y sparkline histórica. Las máquinas permanecen separadas y no se intenta inferir una cuenta compartida.
