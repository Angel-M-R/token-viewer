# Spec 03 — Dashboard local (`apps/web`)

## Objetivo

SPA React/Vite ejecutada exclusivamente en local. Descubre los snapshots versionados mediante imports estáticos, valida el conjunto completo y ejecuta todas las consultas en memoria. No usa autenticación, procesos auxiliares, proxy, hosting público ni rutas de datos individuales.

## Filtros globales

- Rango de fechas local con presets y rango custom.
- Multiselect de máquina, agente, proveedor y modelo derivado de los snapshots cargados.
- Selector de métrica para el calendar heatmap diario.
- Estado persistido en query params sin hora ni zona horaria.

Las tres identidades aparecen en el dashboard, incluida `old-mac` como histórico consultable.

## Vistas

1. Resumen de requests, cinco categorías de tokens, costes, solicitudes sin precio y modelos.
2. Serie diaria agrupable por agente, modelo o máquina.
3. Calendar heatmap anual sobre totales diarios.
4. Desglose por proveedor y modelo.
5. Cuotas sanitizadas por máquina y proveedor.

No existe heatmap 7×24, conversión horaria, drill-down individual ni lista de registros.

## Criterios de aceptación

- Un checkout con snapshots v2 válidos carga todas las vistas sin llamadas de red.
- `angel-mac`, `old-mac` y `mac-m5` son filtrables.
- Un snapshot inválido produce un error explícito sin entregar datos parciales.
- Ninguna vista expone login, prompts, sesiones, proyectos, rutas, hashes o solicitudes individuales.
