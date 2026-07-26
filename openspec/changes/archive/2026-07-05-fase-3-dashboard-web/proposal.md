## Why

Las fases 1 y 2 dejan los datos de uso de tokens agregables en el servidor central (API `stats/*`), pero no hay ninguna forma visual de explotarlos: hoy solo se pueden consultar los endpoints a mano. La fase 3 añade el dashboard web (`apps/web`), la interfaz definida en `specs/03-dashboard.md`, para que el usuario vea coste/tokens por día, patrones horarios de actividad y desglose por modelo desde cualquier navegador de la red local.

## What Changes

- Nueva app `apps/web`: SPA React + Vite + TypeScript, compilada a estáticos y servida por el propio servidor (`apps/server`).
- Charts con Apache ECharts (registrado con tema claro y oscuro): barras apiladas diarias, heatmap 7×24 y calendar heatmap anual.
- Barra superior de **filtros globales** (rango de fechas con presets y rango custom, multiselect de máquinas/agentes/modelos, métrica activa del heatmap) persistidos en los query params de la URL.
- Vista de **resumen**: cards de tokens totales (desglose input/output/cache en tooltip), coste USD, requests y máquinas activas, con delta vs el periodo anterior equivalente.
- Vista de **coste y tokens por día**: barras apiladas sobre `stats/daily` con `groupBy` conmutable (agente | modelo | máquina), toggle tokens ↔ coste y media móvil de 7 días superpuesta.
- Vista de **heatmap horario**: matriz 7×24 en hora local del navegador (`stats/heatmap?tz=<navegador>`) según la métrica activa, más calendar heatmap anual estilo GitHub con intensidad diaria.
- Vista de **modelos**: tabla ordenable sobre `stats/models` (tokens por tipo, coste, requests, % del total) con badge de proveedor coloreado.
- Data-fetching con TanStack Query: caché por combinación de filtros, refetch al recuperar el foco y polling cada 60 s.
- Tema claro/oscuro siguiendo `prefers-color-scheme` y pantalla de token (localStorage + Bearer) cuando el servidor define `DASHBOARD_TOKEN`.

## Capabilities

### New Capabilities
- `dashboard-shell`: esqueleto de la SPA — layout, tema claro/oscuro, autenticación por token opcional, estrategia de fetching/polling y servido como estáticos.
- `global-filters`: filtros globales (fechas, máquinas, agentes, modelos, métrica) sincronizados con los query params de la URL y aplicados a todas las vistas.
- `summary-cards`: cards de resumen con totales y deltas vs el periodo anterior equivalente.
- `daily-usage-charts`: gráfica de barras apiladas por día con `groupBy` conmutable, toggle tokens ↔ coste y media móvil de 7 días.
- `hourly-heatmap`: heatmap 7×24 en hora local del navegador y calendar heatmap anual.
- `models-breakdown`: tabla ordenable de desglose por modelo con badges de proveedor.

### Modified Capabilities

_Ninguna: la fase 3 solo consume la API existente de la fase 2 (`stats/*`, `machines`), sin cambiar sus requisitos._

## Impact

- **Código nuevo**: `apps/web` (React + Vite + TypeScript, ECharts, TanStack Query, router ligero para query params).
- **Servidor**: `apps/server` debe servir el build de `apps/web` como estáticos (ya previsto en la fase 2; sin cambios de API).
- **Monorepo**: nuevo workspace en pnpm; `packages/core` aporta los tipos compartidos de las respuestas de la API.
- **Dependencias nuevas**: `react`, `react-dom`, `vite`, `echarts`, `@tanstack/react-query`.
- **API consumida** (solo lectura): `GET /api/v1/stats/summary`, `GET /api/v1/stats/daily`, `GET /api/v1/stats/heatmap`, `GET /api/v1/stats/models`, `GET /api/v1/machines`.
