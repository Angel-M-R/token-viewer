## ADDED Requirements

### Requirement: Contrato exclusivo de snapshots v2
Cada snapshot versionado SHALL declarar `schemaVersion = 2` y MUST validar contra el esquema cerrado v2. El runtime, el collector, el dashboard y las herramientas activas MUST usar únicamente este contrato y MUST NOT incluir compatibilidad, conversión ni rutas alternativas para otros formatos de snapshot.

#### Scenario: Conjunto v2 válido
- **WHEN** todos los ficheros versionados declaran schema 2 y cumplen el contrato cerrado
- **THEN** la validación completa termina con exit code 0 y entrega el conjunto al dashboard

### Requirement: Partición diaria canónica
El sistema SHALL almacenar cada snapshot en `snapshots/<machine>/YYYY/MM/YYYY-MM-DD.json`, donde la ruta, la identidad y la fecha local `Europe/Madrid` MUST coincidir. Cada fila de uso SHALL estar agregada por agente, proveedor y modelo y MUST NOT contener precisión subdiaria.

#### Scenario: Snapshot diario canónico
- **WHEN** una publicadora genera los agregados de una fecha local
- **THEN** escribe como máximo un fichero canónico para su identidad y fecha sin campos horarios

### Requirement: Esquema cerrado y privacidad
El esquema v2 MUST rechazar propiedades desconocidas y MUST impedir que se versionen registros individuales, prompts, conversaciones, sesiones, proyectos, rutas, credenciales, login, payloads originales, datos crudos o hashes. Contadores y costes MUST ser finitos y no negativos, las claves agregadas MUST ser únicas y los totales derivados MUST coincidir.

#### Scenario: Snapshot apto para publicación
- **WHEN** un snapshot pasa la validación de privacidad e invariantes
- **THEN** contiene únicamente dimensiones, métricas agregadas y cuotas sanitizadas permitidas

### Requirement: Ciclo de vida de identidades
El contrato SHALL aceptar `angel-mac`, `old-mac` y `mac-m5` para lectura y validación. Solo `angel-mac` y `mac-m5` MUST poder generar o publicar; `old-mac` MUST permanecer histórica y de solo lectura.

#### Scenario: Histórico de old-mac
- **WHEN** el dashboard carga snapshots válidos de `old-mac`
- **THEN** muestra su histórico sin habilitar generación ni publicación para esa identidad
