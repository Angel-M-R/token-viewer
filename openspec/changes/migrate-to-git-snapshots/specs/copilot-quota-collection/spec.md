## ADDED Requirements

### Requirement: Incorporación local best-effort
El collector SHALL incorporar la muestra sanitizada de Copilot al snapshot diario de su máquina sin enviarla a un servidor. Cualquier fallo de red, API o token MUST registrarse como aviso local y MUST NOT impedir que los agregados de uso válidos se generen y publiquen.

#### Scenario: Muestra válida
- **WHEN** la consulta de Copilot devuelve datos reconocibles
- **THEN** el snapshot del día incluye únicamente proveedor, instante, porcentaje, plan y renovación

#### Scenario: Token revocado
- **WHEN** la API de Copilot responde 401
- **THEN** el collector avisa de que debe repetirse el login local y continúa con los agregados de uso

## MODIFIED Requirements

### Requirement: Snapshot de cuota en cada run
Cuando exista un token local de Copilot, cada ejecución diaria del collector SHALL hacer como máximo una llamada a `GET https://api.github.com/copilot_internal/user`, con las cabeceras requeridas, y SHALL construir una muestra de cuota para el día UTC. Si no existe token, MUST omitir el paso sin afectar al resto del snapshot.

#### Scenario: Run con token configurado
- **WHEN** se ejecuta el collector y hay token de Copilot guardado localmente
- **THEN** realiza una llamada y prepara una muestra con `provider = "copilot"` y `takenAt` UTC

#### Scenario: Run sin token configurado
- **WHEN** no hay token de Copilot
- **THEN** omite la cuota y procesa los adaptadores con normalidad

### Requirement: Mapeo de la respuesta al snapshot
El collector SHALL derivar de la respuesta el porcentaje usado, plan y fecha de renovación, priorizando premium requests con fallback a chat, y SHALL descartar inmediatamente login, identidad de cuenta y respuesta original. El objeto apto para persistencia MUST contener solo los campos permitidos por el contrato de snapshot.

#### Scenario: Respuesta completa
- **WHEN** la API devuelve porcentaje, plan, renovación, login y otros campos
- **THEN** la muestra conserva porcentaje, plan y renovación y elimina login y todos los campos no permitidos

#### Scenario: Respuesta con campos desconocidos
- **WHEN** la API añade campos nuevos
- **THEN** el mapper cerrado los ignora y nunca los copia al snapshot

## REMOVED Requirements

### Requirement: Envío al servidor tolerante a fallos
**Reason**: El servidor y `POST /api/v1/ingest-quota` se retiran.
**Migration**: Incorporar la muestra sanitizada directamente al snapshot diario y conservar el comportamiento best-effort local.

#### Scenario: Sin transporte HTTP interno
- **WHEN** se genera una cuota después del corte
- **THEN** no se usa `serverUrl`, `machineToken` ni un endpoint de TokenViewer
