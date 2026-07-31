# Spec 02 — Contrato de snapshots v2

## Ruta e identidad

Cada fichero vive en `snapshots/<machine>/YYYY/MM/YYYY-MM-DD.json`. Las identidades válidas son `angel-mac`, `old-mac` y `mac-m5`; la ruta, el campo `machine` y la fecha deben coincidir.

## Granularidad diaria

Cada documento declara `schemaVersion: 2` y contiene filas agregadas por agente, proveedor y modelo dentro del día local `Europe/Madrid`. Las métricas incluyen requests, cinco categorías de tokens, coste estimado, coste facturado y solicitudes sin precio. No existe ningún campo de hora ni precisión subdiaria.

Las muestras de cuota conservan solo proveedor, fecha local, porcentaje, plan y renovación. No contienen login ni payload original.

## Privacidad e invariantes

El esquema cerrado rechaza propiedades desconocidas y campos de registros individuales, prompts, conversaciones, sesiones, proyectos, rutas, credenciales, datos crudos, hashes u hora. Los contadores y costes deben ser finitos y no negativos, las claves agregadas son únicas y los totales derivados deben coincidir.

## Ciclo de vida

- `angel-mac` y `mac-m5` generan y publican nuevos snapshots.
- `old-mac` permanece visible en validación y dashboard, pero nunca genera ni publica.
- Todo el conjunto se valida antes de cada commit y en CI.
- Los snapshots son la única persistencia propia de TokenViewer.
