# copilot-quota-collection Specification

## Purpose
TBD - created by archiving change fase-4-copilot-cuotas. Update Purpose after archive.
## Requirements
### Requirement: Snapshot de cuota en cada run
Cuando exista un token de Copilot en el config, cada ejecución de `tokenviewer-collector run` SHALL hacer exactamente una llamada a `GET https://api.github.com/copilot_internal/user` con la cabecera `Authorization: token <oauth>` y las cabeceras de editor requeridas (`Editor-Version`, `Editor-Plugin-Version`, `User-Agent`, `X-Github-Api-Version`), y SHALL construir un snapshot de cuota a partir de la respuesta.

#### Scenario: Run con token configurado
- **WHEN** se ejecuta `run` y hay token de Copilot guardado
- **THEN** el colector llama una única vez a `copilot_internal/user` y genera un snapshot con `provider = "copilot"` y `taken_at` en UTC

#### Scenario: Run sin token configurado
- **WHEN** se ejecuta `run` y no hay token de Copilot guardado
- **THEN** el colector omite el paso de Copilot sin errores ni avisos y procesa los adaptadores de logs con normalidad

### Requirement: Mapeo de la respuesta al snapshot
El colector SHALL mapear la respuesta de `copilot_internal/user` a los campos del snapshot: porcentaje usado (`percent_used`, derivado de las ventanas de cuota de la respuesta, priorizando premium requests con fallback a chat), plan (`plan`), fecha de reset (`resets_at`, si la API la proporciona) y la respuesta JSON completa en `raw`. El `raw` MUST incluir el login de la cuenta de GitHub para que el servidor pueda deduplicar por cuenta.

#### Scenario: Respuesta completa
- **WHEN** la API devuelve porcentaje de premium requests, plan y fecha de reset
- **THEN** el snapshot lleva `percent_used`, `plan` y `resets_at` poblados y `raw` contiene el JSON íntegro de la respuesta con el login de la cuenta

#### Scenario: Respuesta sin fecha de reset
- **WHEN** la API no incluye fecha de reset
- **THEN** el snapshot se genera igualmente con `resets_at` vacío, sin considerarse un error

#### Scenario: Campos desconocidos en la respuesta
- **WHEN** la API devuelve campos nuevos o cambia campos no esenciales del formato
- **THEN** el colector ignora lo desconocido, mapea lo que reconoce y conserva la respuesta íntegra en `raw`

### Requirement: Envío al servidor tolerante a fallos
El colector SHALL enviar el snapshot a `POST {serverUrl}/api/v1/ingest-quota` autenticado con el `machineToken` (Bearer), y el paso de Copilot MUST ser best-effort: ningún fallo de Copilot (red, API, token inválido, endpoint inexistente) puede impedir la ingesta de los adaptadores de logs en ese mismo run.

#### Scenario: Envío correcto
- **WHEN** el snapshot se genera y el servidor responde 2xx
- **THEN** el run continúa y el resultado del envío queda reflejado en la salida del colector

#### Scenario: Token de GitHub caducado o revocado
- **WHEN** `copilot_internal/user` responde 401
- **THEN** el colector registra un aviso indicando re-ejecutar `tokenviewer-collector copilot login` y el run continúa con los adaptadores de logs

#### Scenario: Fallo de red o servidor sin soporte
- **WHEN** la llamada a la API de GitHub falla por red o el servidor de TokenViewer responde 404/5xx a `ingest-quota`
- **THEN** el colector registra un aviso y el run termina con la ingesta de logs intacta

