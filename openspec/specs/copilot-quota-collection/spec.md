# copilot-quota-collection Specification

## Purpose
TBD - created by archiving change fase-4-copilot-cuotas. Update Purpose after archive.
## Requirements
### Requirement: Snapshot de cuota en cada run
Cuando exista un token local de Copilot, cada ejecución diaria del collector SHALL hacer como máximo una llamada a `GET https://api.github.com/copilot_internal/user` con las cabeceras requeridas y SHALL construir una muestra para la fecha local `Europe/Madrid`. Sin token, MUST omitir el paso sin afectar al uso.

#### Scenario: Run con token configurado
- **WHEN** se ejecuta el collector con token local
- **THEN** realiza una llamada y prepara una muestra sanitizada para el día

#### Scenario: Run sin token configurado
- **WHEN** no existe token de Copilot
- **THEN** omite la cuota y procesa los adaptadores normalmente

### Requirement: Mapeo de la respuesta al snapshot
El collector SHALL derivar porcentaje usado, plan y renovación y SHALL descartar inmediatamente login, identidad de cuenta, payload original y campos no permitidos. El objeto persistible MUST cumplir el esquema cerrado v2.

#### Scenario: Respuesta completa
- **WHEN** Copilot devuelve métricas junto con identidad y campos adicionales
- **THEN** la muestra conserva solo proveedor, fecha, porcentaje, plan y renovación

### Requirement: Envío al servidor tolerante a fallos
La captura de Copilot SHALL ser best-effort local: cualquier fallo de red, API o token MUST producir un aviso y MUST NOT impedir la generación de agregados de uso válidos. Una muestra válida MUST incorporarse al snapshot diario sin transporte interno de TokenViewer.

#### Scenario: Fallo de Copilot
- **WHEN** la API falla o rechaza el token
- **THEN** el collector avisa y continúa generando el resto del snapshot

#### Scenario: Muestra válida
- **WHEN** la respuesta se sanitiza correctamente
- **THEN** se incorpora al snapshot local sin enviarla a un servidor de TokenViewer
