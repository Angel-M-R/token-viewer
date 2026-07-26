# Spec 03 — Dashboard web (`apps/web`)

## Objetivo

SPA React (Vite + TypeScript) servida como estáticos por el servidor. Librería de charts: **Apache ECharts** (via `echarts-for-react` o wrapper propio ligero) — elegida porque trae de serie heatmap cartesiano (hora × día), calendar heatmap estilo GitHub, series temporales apiladas, tooltips y modo oscuro, todo canvas y sin dependencias extra.

## Layout

Barra superior con **filtros globales** que afectan a toda la página:
- Rango de fechas (presets: 7d, 30d, 90d, año, todo; y rango custom)
- Máquina(s), agente(s), modelo(s) — multiselect poblados desde la API
- Métrica activa para el heatmap: tokens | coste | requests

## Vistas v1

### 1. Resumen (cards)
Total de tokens (desglosado input/output/cache en tooltip), coste estimado USD, nº de requests, nº de máquinas activas, y delta vs periodo anterior equivalente.

### 2. Coste y tokens por día
- Gráfica principal de barras apiladas por día (`stats/daily`), con `groupBy` conmutable: por agente, por modelo o por máquina.
- Toggle tokens ↔ coste.
- Línea de media móvil de 7 días superpuesta.

### 3. Heatmap horario
- Matriz 7 (día de semana) × 24 (hora local del navegador) con intensidad por la métrica activa (`stats/heatmap?tz=<navegador>`).
- Escala de color secuencial con leyenda; celda con tooltip (día, hora, valor, nº requests).
- Extra barato con ECharts: **calendar heatmap** anual estilo GitHub debajo, con intensidad diaria.

### 4. Modelos
Tabla ordenable por modelo (`stats/models`): tokens por tipo, coste, requests, % del total, con badge de proveedor coloreado (reusar la idea de mapeo proveedor→color del informe HTML de devrage).

## Detalles de implementación

- Data-fetching con TanStack Query (caché por combinación de filtros, refetch al volver el foco + polling cada 60 s).
- Estado de filtros en la URL (query params) para poder compartir/bookmarkear vistas.
- Tema claro/oscuro siguiendo `prefers-color-scheme`; ECharts registrado con ambos temas.
- Si el servidor define `DASHBOARD_TOKEN`: pantalla simple de token que lo guarda en localStorage y lo añade como Bearer.
- Formateo: tokens abreviados (1.2M), coste con 2 decimales USD, fechas en locale del navegador.

## Backlog (fase 4, fuera de v1)

- Comparativa entre máquinas (ranking + series superpuestas).
- Desglose por proyecto/sesión con drill-down a `records`.
- Vista de cuota de Copilot (spec 04).
- Export CSV de cualquier vista.

## Criterios de aceptación

- Con 6 meses de datos, cambiar un filtro re-renderiza en < 1 s (agregación en servidor, no en cliente).
- El heatmap muestra horas en la zona horaria del navegador (una sesión a las 23:00 de Madrid no aparece a las 21:00).
- Usable en una ventana de 1280px y en móvil (charts con `resize` observer).
