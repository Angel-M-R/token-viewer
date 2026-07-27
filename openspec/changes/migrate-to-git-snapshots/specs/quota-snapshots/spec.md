## ADDED Requirements

### Requirement: Persistencia histórica sanitizada por máquina
Las muestras de cuota SHALL persistirse dentro del snapshot diario de la máquina que las obtuvo y MUST contener solo proveedor, instante, porcentaje, plan y renovación. El histórico MUST poder reconstruir la evolución temporal sin login, identidad de cuenta ni payload original.

#### Scenario: Historial de varios días
- **WHEN** una máquina publica muestras de Copilot en días sucesivos
- **THEN** la capa local puede ordenar sus porcentajes y renovaciones por instante a través de los snapshots diarios

#### Scenario: Datos privados presentes en origen
- **WHEN** la respuesta original contiene login y campos adicionales
- **THEN** ninguno se persiste en el histórico versionado

## MODIFIED Requirements

### Requirement: API de lectura de snapshots deduplicada por cuenta
La capa local SHALL leer las cuotas dentro del rango filtrado y agruparlas por máquina y proveedor. Por cada grupo SHALL devolver la muestra más reciente y la serie temporal de porcentajes, deduplicando muestras idénticas por instante sin usar ni inferir una cuenta.

#### Scenario: Misma cuota de una máquina repetida
- **WHEN** el conjunto contiene dos muestras equivalentes de la misma máquina, proveedor e instante
- **THEN** la serie local contiene un único punto

#### Scenario: Tres identidades con Copilot
- **WHEN** `angel-mac`, `old-mac` y `mac-m5` tienen muestras en el rango
- **THEN** la lectura devuelve un grupo por identidad y proveedor, sin login

#### Scenario: Sin snapshots en el periodo
- **WHEN** no hay muestras de cuota dentro del rango
- **THEN** la lectura devuelve una lista vacía

## REMOVED Requirements

### Requirement: Tabla quota_snapshots extensible por proveedor
**Reason**: SQLite deja de ser almacenamiento de TokenViewer y el payload `raw` está prohibido.
**Migration**: Persistir el subconjunto sanitizado en el snapshot diario particionado por máquina.

#### Scenario: Sin tabla ni raw
- **WHEN** finaliza el corte
- **THEN** no existe `quota_snapshots` y ninguna respuesta original se versiona

### Requirement: Endpoint POST /api/v1/ingest-quota con auth de máquina
**Reason**: No existe servidor de ingesta ni token de máquina.
**Migration**: Validar e incorporar la muestra localmente antes del commit Git.

#### Scenario: Cuota local
- **WHEN** el collector obtiene una muestra
- **THEN** no realiza una petición a `/api/v1/ingest-quota`

### Requirement: Dedup blando por máquina y proveedor
**Reason**: La captura es diaria y la unicidad se valida en el fichero canónico, sin reloj de servidor.
**Migration**: Deduplicar localmente por máquina, proveedor e instante y no escribir más de una representación equivalente.

#### Scenario: Muestra repetida localmente
- **WHEN** una ejecución intenta incorporar dos veces la misma muestra
- **THEN** el snapshot conserva una sola representación
