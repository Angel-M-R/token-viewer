## Context

Las fases 1–3 dejaron el pipeline completo para agentes con logs locales: adaptadores → `UsageRecord` → `POST /api/v1/ingest` idempotente → agregaciones SQL → dashboard. GitHub Copilot rompe ese modelo: no escribe contadores de tokens en logs locales accesibles, y su única fuente fiable es la API cloud `GET https://api.github.com/copilot_internal/user`, que devuelve **cuota** (porcentaje usado de premium requests, plan, fecha de reset), no eventos de tokens. `references/CodexBar` (`Providers/Copilot`) ya resuelve el acceso: device-flow OAuth de GitHub con el client-id de la extensión de VS Code y scope `read:user`, y la llamada a `copilot_internal/user` con cabeceras de editor.

Restricciones: la cuota es por **cuenta de GitHub**, no por máquina; la API es interna y su formato puede cambiar; el token OAuth es un secreto que no debe salir del PC del usuario.

## Goals / Non-Goals

**Goals:**

- Login de Copilot en el colector vía device-flow, con el token guardado en el config local con permisos `0600`.
- Un snapshot de cuota por `run` del colector, enviado al servidor por un endpoint dedicado con la misma auth de máquina.
- Esquema `quota_snapshots` extensible a otros proveedores "de ventana de cuota" (p. ej. límites 5h/semanales de Claude vía OAuth local, estilo CodexBar).
- Card de Copilot en el dashboard: gauge de % usado, días hasta reset y sparkline del periodo filtrado, deduplicada por cuenta de GitHub.

**Non-Goals:**

- Tokens/coste de Copilot: la API no los expone; Copilot no participa en `usage_records`, pricing ni heatmaps.
- "Budget extras" de CodexBar (scraping web con cookies de github.com): fuera de alcance.
- GitHub Enterprise (hosts distintos de `github.com`): el diseño no lo impide, pero la v1 solo contempla github.com.
- Refresh/rotación automática del token OAuth: si caduca o se revoca, el usuario repite `copilot login`.
- Otros proveedores de cuota: el esquema queda preparado, pero solo se implementa Copilot.

## Decisions

### 1. Snapshots de cuota como entidad propia, no `UsageRecord`

`UsageRecord` modela eventos append-only de tokens con dedupe exacto por `record_hash`; la cuota de Copilot es un estado puntual (porcentaje, plan, reset) sin tokens ni coste. Forzarla dentro de `usage_records` obligaría a campos nulos masivos, rompería las agregaciones de coste y el dedupe por hash carece de sentido para un valor que cambia continuamente. Se crea la tabla `quota_snapshots` con su propio endpoint `POST /api/v1/ingest-quota`.

- *Alternativa descartada:* `UsageRecord` con tokens a 0 y el porcentaje en metadata — contamina todas las estadísticas existentes y no aporta nada.
- La columna `provider` es texto libre (`"copilot"` hoy) y `raw` guarda el JSON completo de la respuesta: el mismo esquema absorbe futuros proveedores de cuota sin migración.

### 2. Device-flow OAuth de GitHub, con el client-id de la extensión oficial

`copilot_internal/user` solo acepta tokens OAuth de apps con acceso a Copilot; el patrón probado (CodexBar `CopilotDeviceFlow.swift`) usa el client-id de VS Code (`Iv1.b507a08c87ecfe98`), scope `read:user`, `POST https://github.com/login/device/code` y polling a `POST https://github.com/login/oauth/access_token` respetando `interval`, `slow_down` (+5 s) y `authorization_pending`. El device-flow es el único flujo OAuth razonable para una CLI sin navegador embebido ni servidor de callback.

- *Alternativa descartada:* pedir al usuario un PAT — los PAT clásicos/fine-grained no autorizan `copilot_internal/user`.
- La llamada de cuota usa `Authorization: token <oauth>` más cabeceras de editor (`Editor-Version`, `Editor-Plugin-Version`, `User-Agent`, `X-Github-Api-Version`), como documenta CodexBar.

### 3. Token en el config local con permisos `0600`; el servidor nunca lo ve

El token se guarda en el fichero de config del colector (junto al `machineToken` ya existente), con `chmod 0600` sobre el fichero tras escribirlo. Al servidor solo viajan snapshots ya resueltos (porcentaje, plan, reset, raw); un compromiso del servidor no expone la cuenta de GitHub de nadie.

- *Alternativa descartada:* keychain del SO — añade dependencias nativas y diverge entre macOS/Linux; `0600` en un config local es el estándar de CLIs (gh, npm) y suficiente para el modelo de amenaza doméstico del proyecto.

### 4. Dedup blando temporal en el servidor, no idempotencia por hash

Un snapshot no tiene identidad natural (dos lecturas seguidas pueden ser idénticas o no). En vez de hash, el servidor descarta el snapshot entrante si el último de esa `machine_id`+`provider` tiene menos de 5 minutos, respondiendo 200 con `{accepted: false, reason: "duplicate"}` para que el colector no reintente. Esto acota el crecimiento de la tabla frente a runs frecuentes sin exigir estado en el cliente.

### 5. Dedup por cuenta de GitHub en la lectura, no en la escritura

La cuota es por cuenta: dos PCs con la misma cuenta reportan el mismo porcentaje. Se guarda **todo** (cada máquina escribe sus snapshots, útil para diagnosticar qué máquina reporta) y se deduplica al leer: la respuesta de `copilot_internal/user` incluye el login de la cuenta, que se persiste dentro de `raw` y se expone como campo `account` en la API de lectura. El endpoint de lectura agrupa por cuenta y devuelve, por cuenta, el snapshot más reciente y la serie temporal del periodo (colapsando lecturas simultáneas de varias máquinas). El dashboard pinta una card por cuenta.

- *Alternativa descartada:* deduplicar en la ingesta (clave por cuenta) — perdería la trazabilidad por máquina y complicaría la extensión a proveedores donde la ventana sí sea por máquina.

### 6. Tolerancia a fallos en el `run` del colector

El paso de Copilot es *best-effort*: si no hay token configurado se omite en silencio; si la red o la API fallan, o el token ha caducado (401), se registra un aviso (con indicación de re-ejecutar `copilot login` en el caso 401) y el run continúa — un fallo de Copilot nunca bloquea la ingesta de los adaptadores de logs.

## Risks / Trade-offs

- **API interna no versionada** (`copilot_internal/user` puede cambiar de formato sin aviso) → parser defensivo (campos opcionales), la respuesta completa se conserva en `raw` para reprocesar históricos, y las cabeceras de editor se centralizan en una constante fácil de actualizar.
- **Client-id de terceros (VS Code)** → es el patrón asumido por el ecosistema (CodexBar y otros); si GitHub lo restringiera, el cambio queda aislado en una constante del colector.
- **Frecuencia de snapshots atada a la de `run`** → si el colector corre poco, la sparkline queda dispersa; si corre mucho, el dedup < 5 min acota el volumen. Aceptable: la cuota mensual cambia despacio.
- **`resets_at` puede no venir en la API** (CodexBar documenta que a veces no hay fecha de reset) → columna nullable y la card muestra "—" cuando falta.
- **Reloj del cliente vs servidor en `taken_at`** → el colector envía `taken_at` en UTC pero el servidor usa su propia hora de recepción para el dedup blando, evitando que relojes desviados lo burlen.
- **Varias cuentas en la misma instalación** → no soportado en v1 (un token por colector); el dedup por cuenta en lectura ya deja el modelo de datos correcto si se amplía.

## Migration Plan

1. Migración Drizzle aditiva: `CREATE TABLE quota_snapshots` + índice `(machine_id, provider, taken_at)`. No toca tablas existentes; se aplica al arrancar el servidor.
2. Desplegar servidor (nuevo endpoint) antes que colectores: un colector antiguo simplemente no llama a `ingest-quota`; un colector nuevo contra servidor antiguo recibe 404 y lo trata como fallo best-effort.
3. Dashboard: la card solo se muestra si existen snapshots en el periodo; sin datos de Copilot el resumen queda como en fase 3.
4. Rollback: retirar la card y el endpoint; la tabla puede quedarse (datos inertes) o eliminarse con una migración inversa.

## Open Questions

- ¿Campo primario del porcentaje: `quotaSnapshots.premiumInteractions` con fallback a `chat` (orden que usa CodexBar)? Se asume ese orden salvo que la respuesta real diga lo contrario.
- ¿Umbral de aviso visual en el gauge (p. ej. ámbar > 75 %, rojo > 90 %)? Decisión de UI en implementación; no afecta al esquema.
