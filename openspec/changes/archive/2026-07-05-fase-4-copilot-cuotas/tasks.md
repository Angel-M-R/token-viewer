## 1. Tipos compartidos (packages/core)

- [x] 1.1 Definir el tipo `QuotaSnapshot` y su esquema zod (`provider`, `takenAt` UTC, `percentUsed?`, `plan?`, `resetsAt?`, `raw`) en `packages/core`
- [x] 1.2 Definir los esquemas zod de la API: request/response de `POST /api/v1/ingest-quota` (`{accepted: boolean}`) y respuesta del endpoint de lectura (lista por cuenta con último snapshot + serie temporal)
- [x] 1.3 Tests unitarios de validación de los esquemas (snapshot válido, campos opcionales ausentes, cuerpo inválido)

## 2. Colector — auth de Copilot (copilot-auth)

- [x] 2.1 Implementar el device-flow de GitHub en `apps/collector`: `POST /login/device/code` (client-id de VS Code, scope `read:user`) y polling a `POST /login/oauth/access_token` con manejo de `authorization_pending`, `slow_down` (+5 s) y `expired_token`
- [x] 2.2 Comando `tokenviewer-collector copilot login`: mostrar `user_code` + URL de verificación, ejecutar el flow, guardar el token en el config y aplicar `chmod 0600` al fichero
- [x] 2.3 Comandos `copilot status` (indica sesión sin imprimir el token completo) y `copilot logout` (borra solo el token, conserva el resto del config)
- [x] 2.4 Tests del device-flow con HTTP mockeado (éxito, pending→éxito, slow_down, expiración) y test de permisos `0600` del config

## 3. Colector — snapshot de cuota (copilot-quota-collection)

- [x] 3.1 Cliente de `GET https://api.github.com/copilot_internal/user` con cabeceras `Authorization: token`, `Editor-Version`, `Editor-Plugin-Version`, `User-Agent`, `X-Github-Api-Version` centralizadas en constantes
- [x] 3.2 Mapeo defensivo de la respuesta a `QuotaSnapshot`: `percent_used` desde premium requests con fallback a chat, `plan`, `resets_at` opcional, JSON íntegro (con login de la cuenta) en `raw`
- [x] 3.3 Integrar el paso Copilot en `run`: una llamada por run solo si hay token; envío a `POST {serverUrl}/api/v1/ingest-quota` con Bearer `machineToken`
- [x] 3.4 Tolerancia a fallos best-effort: sin token → omitir en silencio; 401 de GitHub → aviso "re-ejecuta copilot login"; red/404/5xx → aviso; en todos los casos la ingesta de logs continúa
- [x] 3.5 Tests con API mockeada: respuesta completa, sin `resets_at`, campos desconocidos, 401, fallo de red, y run sin token

## 4. Servidor — quota_snapshots e ingest-quota (quota-snapshots)

- [x] 4.1 Migración Drizzle aditiva: tabla `quota_snapshots` (id, machine_id FK NOT NULL, provider, taken_at, percent_used, plan, resets_at, raw) + índice `(machine_id, provider, taken_at)`
- [x] 4.2 Endpoint `POST /api/v1/ingest-quota` con la misma auth Bearer de máquina que `/api/v1/ingest`: 401 sin token válido, 400 con cuerpo inválido (validación zod compartida)
- [x] 4.3 Dedup blando: descartar con 2xx `{accepted: false}` si el último snapshot de esa máquina/provider tiene < 5 min según la hora del servidor; insertar y responder `{accepted: true}` en caso contrario
- [x] 4.4 Endpoint de lectura para el dashboard: por proveedor y rango temporal, agrupar por cuenta (login extraído de `raw`), devolver último snapshot + serie de `percent_used` por cuenta, colapsando máquinas de la misma cuenta
- [x] 4.5 Tests de integración: ingesta válida, 401, 400, dedup < 5 min por máquina (dos máquinas no se bloquean entre sí), lectura con dos máquinas/misma cuenta, dos cuentas y periodo vacío

## 5. Dashboard — card de Copilot (quota-dashboard)

- [x] 5.1 Cliente de la API de lectura de snapshots en `apps/web`, integrado con los filtros globales de rango temporal
- [x] 5.2 Componente card de Copilot: gauge ECharts con `percent_used` del último snapshot, días hasta `resets_at` ("—" si falta), plan y login de la cuenta
- [x] 5.3 Sparkline ECharts con la serie de `percent_used` del periodo; degradación elegante con un único punto; actualización al cambiar los filtros globales
- [x] 5.4 Render en el resumen: una card por cuenta (deduplicado por cuenta, no por máquina) y ocultar la sección si no hay snapshots en el periodo
- [x] 5.5 Tests de componente: card con datos completos, sin `resets_at`, una card por cuenta con dos máquinas, sin datos → sin card

## 6. Verificación end-to-end

- [x] 6.1 Flujo completo en local: `copilot login` real (o mock documentado), `run` → snapshot en SQLite → card visible en el dashboard con gauge y sparkline
- [x] 6.2 Compatibilidad de despliegue: colector antiguo contra servidor nuevo (ignora ingest-quota) y colector nuevo contra servidor antiguo (404 tratado como best-effort)
- [x] 6.3 Repasar que no se tocan `references/` ni `specs/` y actualizar el README del colector con los comandos `copilot login/status/logout`
