## MODIFIED Requirements

### Requirement: Almacenamiento del token con permisos 0600
El collector SHALL guardar el token OAuth de GitHub en su configuración local y MUST dejar el fichero con permisos `0600`. El token MUST usarse únicamente para las operaciones locales autorizadas contra GitHub y Copilot y MUST NOT incorporarse a snapshots, commits, logs ni configuración de publicación.

#### Scenario: Permisos tras el login
- **WHEN** el login termina y el token se escribe
- **THEN** el fichero queda limitado a lectura y escritura del propietario

#### Scenario: El token no se publica
- **WHEN** el collector genera y publica un snapshot
- **THEN** el snapshot, commit y configuración operativa no contienen el token OAuth
