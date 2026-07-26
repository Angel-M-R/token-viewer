## 1. Setup de apps/web

- [x] 1.1 Crear el workspace `apps/web` con Vite + React + TypeScript y registrarlo en el monorepo pnpm
- [x] 1.2 Añadir dependencias: `react`, `react-dom`, `echarts`, `@tanstack/react-query`; devDeps de Vite/TS; usar los esquemas zod de `packages/core`
- [x] 1.3 Configurar Vite: proxy de `/api` al servidor local en desarrollo y `build.outDir` consumible por `apps/server`
- [x] 1.4 Crear la estructura de carpetas por features (`api/`, `filters/`, `charts/`, `features/{summary,daily,heatmap,models}`, `theme/`, `auth/`, `lib/`)

## 2. Cliente de API y fetching

- [x] 2.1 Implementar `api/client.ts`: base `/api/v1`, header `Authorization: Bearer` opcional, validación de respuestas con zod de `packages/core`
- [x] 2.2 Configurar el `QueryClient` global: `refetchInterval` 60 s, `refetchOnWindowFocus`, `staleTime` 30 s, `placeholderData` (keep previous)
- [x] 2.3 Implementar hooks `useSummary`, `useDaily`, `useHeatmap`, `useModels`, `useMachines` con query keys por endpoint + filtros serializados
- [x] 2.4 Incluir `tz` IANA del navegador (`Intl.DateTimeFormat().resolvedOptions().timeZone`) en la petición del heatmap

## 3. Filtros globales en la URL

- [x] 3.1 Implementar el hook `useFilters()`: leer/escribir query params con `URLSearchParams` + `history.replaceState` y reaccionar a `popstate`
- [x] 3.2 Implementar la resolución de presets de fechas (7d, 30d, 90d, año, todo) a `from`/`to`, y rango custom con fechas ISO explícitas
- [x] 3.3 Construir la `FilterBar`: selector de rango con presets y custom, multiselects de máquina/agente/modelo, selector de métrica del heatmap
- [x] 3.4 Poblar los multiselects desde la API (máquinas de `GET /machines`; agentes y modelos de los datos agregados)
- [x] 3.5 Tests del hook: URL→estado, estado→URL, navegación atrás, valores repetidos (`model` múltiple)

## 4. Tema y wrapper de charts

- [x] 4.1 Definir variables CSS de tema (claro/oscuro) y el hook `useTheme()` siguiendo `prefers-color-scheme` con listener de cambios en caliente
- [x] 4.2 Crear `theme/providers.ts` con el mapeo proveedor→color compartido por badges y series
- [x] 4.3 Registrar los temas de ECharts `tokenviewer-light`/`tokenviewer-dark` a partir de las variables de tema
- [x] 4.4 Implementar el wrapper `<EChart>`: init/dispose, `setOption` con `notMerge`, `ResizeObserver`, re-init al cambiar de tema; tests de montaje/desmontaje
- [x] 4.5 Implementar utilidades de formateo en `lib/`: tokens abreviados (1.2M), USD 2 decimales, fechas en locale del navegador; con tests

## 5. Vista de resumen (cards)

- [x] 5.1 Implementar `SummaryCards`: tokens totales, coste USD, requests y máquinas activas desde `stats/summary`
- [x] 5.2 Añadir el tooltip de desglose input/output/cache en la card de tokens
- [x] 5.3 Implementar los deltas: segunda query `stats/summary` del periodo anterior equivalente, con dirección y magnitud; omitir el delta si el periodo anterior no tiene datos
- [x] 5.4 Estado vacío (valores a cero) cuando los filtros no devuelven datos

## 6. Gráfica diaria de barras apiladas

- [x] 6.1 Implementar `DailyChart` sobre `stats/daily`: barras apiladas por día con tooltip por segmento y total
- [x] 6.2 Añadir el conmutador de `groupBy` (agente | modelo | máquina) persistido en la URL
- [x] 6.3 Añadir el toggle tokens ↔ coste con ejes y formatos coherentes
- [x] 6.4 Calcular y superponer la media móvil de 7 días en cliente (ventana parcial si hay < 7 días); tests del cálculo

## 7. Heatmaps

- [x] 7.1 Implementar `HourlyHeatmap` 7×24 sobre `stats/heatmap` con la métrica activa y `visualMap` con escala secuencial
- [x] 7.2 Tooltip por celda: día de la semana, hora, valor formateado y nº de requests
- [x] 7.3 Verificar la zona horaria: test/comprobación de que una sesión a las 23:00 hora local cae en la celda de las 23:00 (petición con `tz` correcta)
- [x] 7.4 Implementar `CalendarHeatmap` anual estilo GitHub con intensidad diaria y color de valor cero para días sin actividad

## 8. Tabla de modelos

- [x] 8.1 Implementar `ModelsTable` sobre `stats/models`: tokens por tipo, coste, requests y % del total
- [x] 8.2 Añadir ordenación por columnas numéricas (asc/desc al pulsar la cabecera)
- [x] 8.3 Implementar `ProviderBadge` con el mapeo proveedor→color de `theme/providers.ts`

## 9. Autenticación por token del dashboard

- [x] 9.1 Implementar `TokenGate`: sondeo inicial, pantalla de token ante 401, persistencia en `localStorage` y Bearer en las peticiones
- [x] 9.2 Manejar 401 posteriores: limpiar el token y volver a la pantalla
- [x] 9.3 Verificar el paso directo sin pantalla cuando el servidor no define `DASHBOARD_TOKEN`

## 10. Integración, responsive y verificación

- [x] 10.1 Componer la página completa (FilterBar + cards + gráfica diaria + heatmaps + tabla) con layout usable a 1280 px y en móvil
- [x] 10.2 Integrar el build en el servido de estáticos de `apps/server` y en la imagen Docker; comprobar acceso en `/`
- [x] 10.3 Verificar el rendimiento: con ~6 meses de datos, cambiar un filtro re-renderiza en < 1 s
- [x] 10.4 Verificar polling 60 s, refetch on focus y caché por combinación de filtros
- [x] 10.5 Revisar estados vacíos/carga/error en todas las vistas y el peso del bundle (imports por módulo de ECharts)
