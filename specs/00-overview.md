# TokenViewer — Visión general

## Propósito

Aplicación para agregar y visualizar el uso de tokens de inferencia de IA de **varios PCs** (macOS y Linux) y **varios agentes/proveedores** (Claude Code, Codex, Cursor, OpenCode, Amp, Cline, Pi, T3, Zed; Copilot en fase 2). Ofrece gráficos de coste/tokens por día, heatmap horario de actividad y filtros por máquina/proveedor/modelo.

## Decisiones cerradas

| Decisión | Elección |
|---|---|
| Fuente de datos | Logs locales de cada agente (sin auth cloud), salvo Copilot (fase 2, API GitHub) |
| Sincronización | Colector en cada PC → API del servidor central |
| Servidor | Self-hosted con Docker (API + SQLite en un contenedor) |
| Interfaz | Dashboard web servido por el propio servidor |
| Plataformas colector | macOS y Linux |
| Stack | Monorepo TypeScript (pnpm workspaces) |
| Charts | Apache ECharts (heatmaps y calendarios nativos) |
| Precios | Catálogo de https://models.dev/api.json, coste calculado en el servidor |

## Arquitectura

```
┌─────────── PC 1 (macOS) ───────────┐
│ collector (CLI Node)               │
│  ├─ adapters: claude, codex, ...   │──┐
│  └─ estado incremental (cursores)  │  │  POST /api/v1/ingest
└────────────────────────────────────┘  │  (Bearer token por máquina)
┌─────────── PC 2 (Linux) ───────────┐  │
│ collector                          │──┤
└────────────────────────────────────┘  ▼
                        ┌──────── Servidor (Docker) ────────┐
                        │ API Hono + SQLite (Drizzle)       │
                        │  ├─ ingest idempotente (dedup)    │
                        │  ├─ pricing (models.dev, caché)   │
                        │  ├─ endpoints de agregación       │
                        │  └─ sirve el dashboard (estático) │
                        └───────────────┬───────────────────┘
                                        │ GET /api/v1/stats/*
                        ┌───────────────▼───────────────────┐
                        │ Dashboard web (React + ECharts)   │
                        └────────────────────────────────────┘
```

## Estructura del monorepo

```
tokenViewer/
├── package.json              # pnpm workspaces
├── packages/
│   ├── core/                 # tipos compartidos: UsageRecord, esquemas zod de la API
│   └── adapters/             # adaptadores por agente (portados de references/devrage)
├── apps/
│   ├── collector/            # CLI que escanea y envía al servidor
│   ├── server/               # API Hono + SQLite/Drizzle + estáticos del dashboard
│   └── web/                  # React + Vite + ECharts
├── docker/                   # Dockerfile del servidor + docker-compose.yml
├── specs/                    # estos documentos
└── references/               # proyectos de referencia (no se tocan)
```

## Referencias aprovechadas

- **devrage** (`references/devrage`): se portan los adaptadores de `src/adapters/` (parsers de JSONL/SQLite por agente, ya normalizan a `UsageRecord`) y la lógica de precios de `src/pricing/index.ts` (fórmula, alias de modelos, tiers de contexto, caché con TTL).
- **CodexBar** (`references/CodexBar`): patrón colector-como-servicio (`codexbar serve`), rutas de logs documentadas en `docs/codex.md` y `docs/CLAUDE.md`, y el flujo device-flow de Copilot para la fase 2.

## Fases

1. **Fase 1 — Extracción local**: `packages/core` + `packages/adapters` (los 9 de devrage) + collector en modo local (`collect --dry-run` imprime/exporta JSON). Verificable sin servidor.
2. **Fase 2 — Servidor**: API de ingesta idempotente, esquema SQLite, pricing, Docker. El collector pasa a enviar al servidor.
3. **Fase 3 — Dashboard**: vistas de coste/tokens por día y heatmap horario, con filtros globales.
4. **Fase 4 — Extensiones**: Copilot (snapshots de cuota vía GitHub OAuth), comparativa entre máquinas, desglose por proyecto/sesión, notificaciones.

## No-objetivos (v1)

- Multi-usuario / auth de usuarios en el dashboard (red doméstica/VPN; un token estático opcional para el dashboard).
- Windows (el diseño de rutas lo deja preparado, pero no se testea).
- APIs cloud de proveedores (límites de rate, spend facturado) salvo Copilot en fase 4.
- Tiempo real por websockets: el dashboard refresca por polling.
