## MODIFIED Requirements

### Requirement: Filtros comunes y agregación en SQL
Todas las consultas locales de estadísticas SHALL aceptar los filtros comunes `machine`, `agent`, `provider`, `model` y rango de fechas, validarlos y aplicarlos sobre las filas horarias cargadas. La agregación MUST ejecutarse en la capa local del dashboard sin SQL, servidor ni autenticación Bearer, y MUST conservar una experiencia interactiva con el histórico disponible de `angel-mac`, la `old-mac` retirada y `mac-m5`.

#### Scenario: Filtros combinados
- **WHEN** se consulta un rango para `angel-mac` y dos agentes
- **THEN** todas las métricas incluyen únicamente filas de esa máquina y esos agentes dentro del rango

#### Scenario: Parámetro inválido
- **WHEN** el rango o un valor de filtro no valida contra el contrato local
- **THEN** la consulta devuelve un error descriptivo sin resultados parciales

### Requirement: Resumen de totales
La consulta local de resumen SHALL devolver, para el rango filtrado, tokens por tipo, coste estimado total, coste facturado total, solicitudes, solicitudes sin precio y modelos distintos, sumando los agregados horarios compatibles.

#### Scenario: Resumen con solicitudes sin precio
- **WHEN** el rango suma 90 solicitudes valoradas y 10 sin tarifa
- **THEN** el resumen reporta 100 solicitudes, 10 sin precio y suma solo los costes estimados disponibles

### Requirement: Serie diaria agrupable
La consulta local de serie diaria SHALL agrupar por fecha los tokens, costes y solicitudes, y SHALL admitir desglose por agente, modelo o máquina usando las dimensiones ya agregadas.

#### Scenario: Serie diaria agrupada por agente
- **WHEN** el rango contiene actividad de Claude y Codex y se agrupa por agente
- **THEN** cada día desglosa las métricas de ambos agentes

### Requirement: Heatmap horario con zona horaria
La consulta local de heatmap SHALL devolver una matriz 7×24 para tokens, coste o solicitudes, transformando cada hora UTC agregada a la zona IANA solicitada antes de agrupar. Una zona inválida MUST producir un error controlado y no se SHALL afirmar precisión inferior a una hora.

#### Scenario: Agrupación por hora local
- **WHEN** una hora UTC corresponde a miércoles/01 en `Europe/Madrid`
- **THEN** sus métricas cuentan en la celda miércoles/01

#### Scenario: Zona horaria inválida
- **WHEN** se solicita `Marte/Olympus`
- **THEN** la consulta local devuelve un error descriptivo

### Requirement: Desglose por modelo
La consulta local de modelos SHALL devolver, para el rango filtrado, proveedor, modelo, solicitudes, tokens por tipo, coste estimado, coste facturado y solicitudes sin precio, combinando filas horarias con la misma dimensión.

#### Scenario: Ranking de modelos
- **WHEN** el rango contiene varios modelos
- **THEN** cada entrada agrega su modelo y el conjunto cubre todas las filas filtradas

## REMOVED Requirements

### Requirement: Drill-down paginado de registros
**Reason**: Los snapshots contienen exclusivamente agregados y la privacidad excluye registros individuales.
**Migration**: Retirar la ruta y cualquier control de UI de registros; usar las vistas agregadas existentes.

#### Scenario: Sin consulta de registros
- **WHEN** finaliza el corte
- **THEN** `/api/v1/records` no existe y el dashboard no ofrece drill-down individual

### Requirement: Liveness
**Reason**: No existe proceso servidor que comprobar.
**Migration**: Validar el build local y la carga de snapshots en lugar de consultar `/health`.

#### Scenario: Sin healthcheck HTTP
- **WHEN** se ejecuta el dashboard migrado
- **THEN** no depende de `GET /health`
