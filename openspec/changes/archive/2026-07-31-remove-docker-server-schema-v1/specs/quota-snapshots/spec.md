## ADDED Requirements

### Requirement: Persistencia histórica sanitizada por máquina
Las muestras de cuota SHALL persistirse dentro del snapshot diario v2 de la máquina y MUST contener solo proveedor, fecha local, porcentaje, plan y renovación. El histórico MUST poder reconstruir su evolución sin login, identidad de cuenta ni payload original.

#### Scenario: Historial de varios días
- **WHEN** una máquina publica muestras en días sucesivos
- **THEN** la capa local puede ordenar la evolución desde sus snapshots diarios

## MODIFIED Requirements

### Requirement: API de lectura de snapshots deduplicada por cuenta
La capa local SHALL leer las cuotas del rango filtrado y agruparlas por máquina y proveedor. Por cada grupo SHALL devolver la muestra más reciente y la serie temporal, deduplicando muestras equivalentes por fecha sin usar ni inferir una cuenta.

#### Scenario: Tres identidades con Copilot
- **WHEN** las tres identidades tienen muestras en el rango
- **THEN** la lectura devuelve un grupo por identidad y proveedor sin login

#### Scenario: Sin snapshots en el periodo
- **WHEN** no hay muestras dentro del rango
- **THEN** la lectura devuelve una lista vacía

## REMOVED Requirements

### Requirement: Tabla quota_snapshots extensible por proveedor
**Reason**: La persistencia propia es el snapshot v2 y el payload original está prohibido.
**Migration**: Guardar únicamente el subconjunto sanitizado en el fichero diario.

#### Scenario: Sin tabla propia
- **WHEN** se persiste una muestra
- **THEN** no se escribe una tabla ni un payload original de TokenViewer

### Requirement: Endpoint POST /api/v1/ingest-quota con auth de máquina
**Reason**: No existe servidor de ingesta ni token de máquina.
**Migration**: Validar e incorporar la muestra localmente antes de publicar.

#### Scenario: Cuota local
- **WHEN** el collector obtiene una muestra
- **THEN** no realiza transporte interno de TokenViewer

### Requirement: Dedup blando por máquina y proveedor
**Reason**: La captura es diaria y la unicidad se valida en el fichero canónico sin reloj de servidor.
**Migration**: Deduplicar localmente por máquina, proveedor y fecha.

#### Scenario: Muestra repetida
- **WHEN** una ejecución intenta incorporar dos veces la misma muestra
- **THEN** el snapshot conserva una sola representación
