# Spec 04 — Copilot (fase 4)

## Por qué es un caso especial

GitHub Copilot **no escribe contadores de tokens en logs locales accesibles**, así que no encaja en el pipeline de adaptadores de logs. CodexBar lo resuelve por API cloud: token OAuth por device-flow de GitHub → `GET https://api.github.com/copilot_internal/user`. Esa API devuelve **cuota** (porcentaje usado de premium requests, plan, fecha de reset), no tokens. Por tanto Copilot se modela como *snapshots de cuota*, no como `UsageRecord`.

## Colector

- `tokenviewer-collector copilot login`: device-flow de GitHub (mismo client-id que usa la extensión oficial, patrón visible en `references/CodexBar` `Providers/Copilot`), guarda el token en el config con permisos 0600.
- En cada `run`, si hay token: una llamada a `copilot_internal/user` → snapshot.

## Modelo de datos (servidor)

```sql
quota_snapshots (
  id            INTEGER PK,
  machine_id    INTEGER NOT NULL REFERENCES machines(id),
  provider      TEXT NOT NULL,      -- "copilot" (extensible a otros de cuota)
  taken_at      TEXT NOT NULL,      -- UTC
  percent_used  REAL,
  plan          TEXT,
  resets_at     TEXT,
  raw           TEXT                -- JSON de la respuesta por si cambia el formato
)
```

Endpoint: `POST /api/v1/ingest-quota`, misma auth de máquina. Dedup blando: se descarta si el último snapshot de esa máquina/provider tiene < 5 min.

## Dashboard

Card en el resumen: gauge de % usado + días hasta reset + sparkline de la evolución del porcentaje en el periodo filtrado.

## Notas

- La cuota es por cuenta GitHub, no por máquina: si dos PCs usan la misma cuenta, el dashboard debe deduplicar por cuenta al mostrar (guardar login de GitHub en `raw` y exponerlo).
- Este mismo esquema sirve en el futuro para otros proveedores "de ventana de cuota" (límites 5h/semanal de Claude vía OAuth local, estilo CodexBar) si algún día ampliamos a fuentes cloud.
