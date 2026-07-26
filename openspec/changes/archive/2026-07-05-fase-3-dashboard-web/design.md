## Context

Las fases 1 y 2 dejan operativos el colector y el servidor central (Hono + SQLite): la API `GET /api/v1/stats/*` ya devuelve los datos agregados en SQL (summary, daily, heatmap con `tz`, models) y `GET /api/v1/machines` lista las máquinas. La fase 3 construye `apps/web`, la SPA que consume esos endpoints y que el servidor sirve como estáticos, según `specs/03-dashboard.md`. Restricciones relevantes: red doméstica/VPN sin multi-usuario (solo un `DASHBOARD_TOKEN` estático opcional), refresco por polling (sin websockets), agregación siempre en el servidor (con 6 meses de datos, cambiar un filtro debe re-renderizar en < 1 s) y usable a 1280 px y en móvil.

## Goals / Non-Goals

**Goals:**

- SPA React + Vite + TypeScript en `apps/web`, compilada a estáticos servidos por `apps/server`.
- Las cuatro vistas v1: cards de resumen con deltas, barras apiladas diarias con `groupBy` conmutable y media móvil 7d, heatmap 7×24 en hora local + calendar heatmap anual, tabla de modelos.
- Filtros globales compartibles/bookmarkeables vía query params de la URL.
- Fetching con TanStack Query: caché por combinación de filtros, refetch on focus, polling 60 s.
- Tema claro/oscuro (`prefers-color-scheme`) aplicado también a los charts.
- Pantalla de token cuando el servidor define `DASHBOARD_TOKEN`.

**Non-Goals:**

- Cambios en la API del servidor (la fase 3 es solo cliente; el servido de estáticos ya se preparó en la fase 2).
- Comparativa entre máquinas, drill-down por proyecto/sesión, vista Copilot, export CSV (backlog de la fase 4).
- Auth multi-usuario, SSR/SEO, tiempo real por websockets.

## Decisions

### 1. Apache ECharts como librería de charts

**Decisión**: `echarts` con un wrapper propio ligero (`<EChart option={...} />` sobre `echarts.init` + `ResizeObserver`), tree-shaken importando solo los módulos usados (bar, line, heatmap, calendar, tooltip, legend, visualMap).

**Por qué**: es la única librería mainstream que trae de serie los tres tipos que necesita la v1 — barras apiladas temporales, heatmap cartesiano 7×24 y calendar heatmap estilo GitHub — más tooltips, `visualMap` (leyenda de escala secuencial) y registro de temas claro/oscuro, todo en canvas y sin dependencias extra. Alternativas consideradas: **Recharts/Nivo** (sin calendar heatmap nativo; heatmap limitado), **Chart.js** (heatmap y calendar solo vía plugins de terceros), **D3 a mano** (coste de desarrollo injustificado). Wrapper propio en lugar de `echarts-for-react` para controlar el ciclo de vida (`setOption` con `notMerge`, dispose, resize) y evitar una dependencia con mantenimiento irregular; si resulta frágil, cambiar a `echarts-for-react` es trivial porque la interfaz es la misma (`option` in, canvas out).

### 2. Estado de filtros en la URL como única fuente de verdad

**Decisión**: los filtros globales (rango/preset de fechas, `machine[]`, `agent[]`, `model[]`, métrica del heatmap, `groupBy`, toggle tokens↔coste) viven exclusivamente en los query params de la URL, leídos/escritos con la History API (`URLSearchParams` + `history.replaceState` + evento `popstate`) expuesta por un hook `useFilters()`. Sin store global (Redux/Zustand) y sin router completo: la app es una sola página.

**Por qué**: la URL da gratis compartir/bookmarkear vistas (requisito de la spec), sobrevive a recargas y evita el bug clásico de doble fuente de verdad estado↔URL. Alternativa considerada: estado en Zustand con sincronización a la URL — más código y riesgo de desincronización para cero beneficio en una SPA de una vista. Los presets (7d, 30d, 90d, año, todo) se guardan como token (`range=30d`) y se resuelven a `from`/`to` al construir la request, de modo que un bookmark de "últimos 30 días" siga siendo relativo; un rango custom se guarda como fechas ISO explícitas.

### 3. Fetching y caché con TanStack Query

**Decisión**: un `QueryClient` global con `refetchInterval: 60_000`, `refetchOnWindowFocus: true` y `staleTime: 30_000`. Query keys estructuradas por endpoint + filtros serializados: `['stats', 'daily', { from, to, groupBy, machine, agent, model }]`. Un módulo `api/client.ts` centraliza `fetch` (base `/api/v1`, header `Authorization: Bearer` si hay token, `tz` del navegador vía `Intl.DateTimeFormat().resolvedOptions().timeZone` en la query del heatmap) y valida las respuestas con los esquemas zod de `packages/core`. `keepPreviousData` (`placeholderData`) para que cambiar un filtro no parpadee a estado vacío.

**Por qué**: la clave-por-filtros hace que volver a una combinación ya vista sea instantáneo (caché) y que cada combinación nueva dispare exactamente una request por endpoint; el polling de 60 s y el refetch on focus vienen de serie sin código propio de timers. Alternativa considerada: `useEffect` + `fetch` manual — reimplementar caché, deduplicación, polling y estados de carga a mano.

### 4. Theming claro/oscuro

**Decisión**: variables CSS (`--bg`, `--fg`, `--card`, paleta de series) bajo `:root` y `[data-theme="dark"]`; un hook `useTheme()` sigue `prefers-color-scheme` (con `matchMedia` + listener para cambios en caliente). Para ECharts se registran dos temas propios (`tokenviewer-light`, `tokenviewer-dark`) construidos con esas mismas variables, y el wrapper re-inicializa el chart al cambiar de tema (ECharts no permite cambiar el tema de una instancia viva). El mapeo proveedor→color (idea del informe HTML de devrage) vive en un módulo `theme/providers.ts` compartido por los badges de la tabla y las series de los charts.

**Por qué**: variables CSS mantienen un único origen para la paleta de UI y de charts; registrar temas de ECharts evita estilar serie a serie. Alternativa considerada: librería de componentes con theming (MUI/Chakra) — peso injustificado para una página con cards, selects y una tabla.

### 5. Autenticación por token del dashboard

**Decisión**: al arrancar, la app hace una request de sondeo (`stats/summary`); si responde 401, muestra una pantalla de token que lo guarda en `localStorage` y lo añade como `Authorization: Bearer` en todas las requests. Un 401 posterior (token revocado) limpia el token y vuelve a la pantalla. Si el servidor no define `DASHBOARD_TOKEN`, el sondeo pasa y la pantalla nunca aparece.

**Por qué**: detectar el modo por la respuesta del servidor evita un endpoint de configuración extra y funciona con el mismo build estático en ambos modos. `localStorage` es aceptable en el modelo de amenaza declarado (red doméstica/VPN, token estático opcional).

### 6. Estructura de `apps/web`

**Decisión**: organización por features, alineada con las capabilities del proposal:

```
apps/web/src/
├── api/          # client.ts, hooks useSummary/useDaily/useHeatmap/useModels/useMachines
├── filters/      # useFilters (URL), FilterBar, presets de fechas
├── charts/       # EChart.tsx (wrapper), temas ECharts
├── features/
│   ├── summary/  # SummaryCards + deltas
│   ├── daily/    # DailyChart (stacked bars + media móvil 7d + toggles)
│   ├── heatmap/  # HourlyHeatmap + CalendarHeatmap
│   └── models/   # ModelsTable + ProviderBadge
├── theme/        # useTheme, variables, providers.ts (proveedor→color)
├── auth/         # TokenGate, almacenamiento del token
└── lib/          # formatos: tokens abreviados (1.2M), USD 2 decimales, fechas en locale
```

Vite con `proxy` de `/api` al servidor en desarrollo; `build.outDir` consumible por `apps/server` (según lo definido en la fase 2).

### 7. Cálculos en cliente: solo presentación

**Decisión**: el cliente no re-agrega datos. La media móvil de 7 días y el % del total de la tabla de modelos se derivan de la respuesta ya agregada (O(n) sobre ≤ ~366 puntos/filas); el delta del resumen se obtiene con una segunda query `stats/summary` del periodo anterior equivalente (misma duración, inmediatamente anterior). Todo lo demás (sumas, buckets por día/hora, conversión tz del heatmap) es responsabilidad del servidor.

**Por qué**: mantiene el criterio de aceptación de < 1 s con 6 meses de datos y evita duplicar la lógica de agregación. La alternativa de un endpoint `summary?compare=prev` se descartó para no tocar la API en esta fase; dos requests cacheadas son suficientes.

## Risks / Trade-offs

- **[Presets relativos en bookmarks]** Un bookmark con `range=30d` cambia de datos con el paso del tiempo → es el comportamiento deseado ("últimos 30 días"); quien quiera un rango fijo usa el rango custom, que serializa fechas ISO absolutas.
- **[Re-init de ECharts al cambiar tema]** Reinstanciar cada chart al alternar claro/oscuro tiene un coste visible → aceptable: el cambio de tema es un evento raro y hay ≤ 4 charts; se reutiliza la última `option` cacheada para repintar sin refetch.
- **[Doble query para deltas]** Las cards disparan 2× `stats/summary` → mitigado por la caché de TanStack Query (el periodo anterior no cambia al hacer polling del actual salvo cambio de filtros) y por ser el endpoint más barato.
- **[Deriva de tz]** Si el navegador reporta una IANA tz que el servidor no resuelve, el heatmap podría caer a UTC → el cliente siempre envía `Intl...timeZone` (IANA estándar) y el escenario de spec (sesión a las 23:00 local en la celda de las 23:00) se cubre con un test contra el endpoint real.
- **[Peso del bundle]** ECharts completo pesa ~1 MB → import por módulos (tree-shaking) y build único sin code-splitting adicional; objetivo < 400 KB gzip, suficiente para red local.
- **[Mantenimiento del wrapper propio de ECharts]** Bugs de ciclo de vida (dispose, resize, StrictMode doble-mount) recaen en nosotros → wrapper mínimo (~60 líneas) con `ResizeObserver`, cubierto por tests de montaje/desmontaje; migrar a `echarts-for-react` sigue abierto como salida barata.

## Migration Plan

No hay migración de datos. Despliegue: `pnpm --filter web build` incorpora los estáticos a la imagen Docker del servidor (fase 2); un usuario sin dashboard simplemente no navegaba a `/`, así que no hay rollback más allá de volver a la imagen anterior. El dashboard es tolerante a datos vacíos (estados "sin datos" en cada vista) para instalaciones recién arrancadas.

## Open Questions

- ¿El endpoint `stats/heatmap` de la fase 2 devuelve también `requests` por celda (necesario para el tooltip "día, hora, valor, nº requests" cuando la métrica activa es tokens o coste)? Si no, el tooltip mostrará solo la métrica activa en v1.
- ¿El calendar heatmap anual usa siempre el año en curso o el año del extremo `to` del rango seleccionado? Propuesta por defecto: el año de `to`.
