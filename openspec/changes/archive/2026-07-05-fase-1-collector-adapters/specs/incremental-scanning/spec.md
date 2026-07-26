## ADDED Requirements

### Requirement: Estado persistente de cursores
El collector SHALL persistir el estado de escaneo en `collector-state.json` dentro del directorio de estado de la plataforma: `~/.local/state/tokenviewer/` en Linux (respetando `$XDG_STATE_HOME`) y `~/Library/Application Support/tokenviewer/` en macOS. El fichero MUST seguir el esquema `{ "schemaVersion": 1, "files": { "<ruta absoluta>": { "size", "mtimeMs", "lastByteOffset" } }, "lastRunAt": "<ISO 8601>" }` y su escritura MUST ser atómica (escribir a fichero temporal y renombrar).

#### Scenario: Primer escaneo crea el estado
- **WHEN** se ejecuta un escaneo y no existe `collector-state.json`
- **THEN** se procesa todo el histórico disponible y al terminar se crea el fichero con una entrada por archivo procesado y `lastRunAt` actualizado

#### Scenario: Escritura atómica
- **WHEN** el proceso muere mientras persiste el estado
- **THEN** el `collector-state.json` previo permanece válido (nunca queda un JSON truncado)

#### Scenario: Estado corrupto o de versión desconocida
- **WHEN** `collector-state.json` no es JSON válido o su `schemaVersion` no es reconocida
- **THEN** el collector lo descarta con un aviso y procede como escaneo completo

### Requirement: Escaneo incremental de ficheros JSONL
Para fuentes JSONL/JSON, el collector SHALL comparar `size` y `mtimeMs` actuales con el cursor guardado: si el fichero creció, MUST parsear solo desde `lastByteOffset`; si `size` menguó (rotación o truncado), MUST re-parsear el fichero entero desde el byte 0; si no cambió, MUST omitirlo sin abrirlo. El `lastByteOffset` MUST fijarse al final de la última línea completa, de modo que una línea final parcial (el agente aún escribiendo) no se consuma y se relea en el siguiente escaneo.

#### Scenario: Fichero con líneas nuevas
- **WHEN** un `.jsonl` ya escaneado crece de 12345 a 20000 bytes
- **THEN** solo se parsean los bytes desde el offset 12345 y el cursor avanza a la nueva posición

#### Scenario: Fichero sin cambios
- **WHEN** `size` y `mtimeMs` coinciden con el cursor guardado
- **THEN** el fichero se omite sin leerlo y no se emiten registros de él

#### Scenario: Fichero rotado
- **WHEN** el `size` actual es menor que el `size` del cursor
- **THEN** el fichero se re-parsea entero desde el byte 0

#### Scenario: Última línea incompleta
- **WHEN** el fichero termina en una línea sin salto de línea final
- **THEN** esa línea no se emite y `lastByteOffset` queda al final de la última línea completa

### Requirement: Escaneo incremental de fuentes SQLite
Para fuentes SQLite, donde no existe offset de bytes fiable, el collector SHALL filtrar las consultas por `timestamp > lastRunAt - 24h` (margen de solape) y delegar la eliminación de repetidos en la dedup por `recordHash`. Si `size` y `mtimeMs` del fichero SQLite no han cambiado respecto al cursor, el collector MUST omitir la fuente sin consultarla.

#### Scenario: Consulta con ventana temporal
- **WHEN** existe `lastRunAt` de un escaneo previo y la base de datos ha cambiado
- **THEN** solo se consultan filas con timestamp posterior a `lastRunAt` menos 24 horas

#### Scenario: Solape absorbido por dedup
- **WHEN** dos escaneos consecutivos emiten el mismo registro por el margen de 24h
- **THEN** ambos comparten `recordHash` y la deduplicación (servidor o resumen dry-run) lo cuenta una sola vez

### Requirement: Re-escaneo completo con --full
El flag `--full` SHALL ignorar todos los cursores guardados y re-escanear el histórico completo de todas las fuentes (backfill). Al terminar con éxito, el estado MUST reescribirse con los cursores resultantes.

#### Scenario: Backfill forzado
- **WHEN** se ejecuta `tokenviewer-collector run --full` con cursores existentes
- **THEN** todos los ficheros se procesan desde el inicio y el estado se regenera al completar

### Requirement: El cursor solo avanza tras confirmación
Los cursores MUST NOT persistirse hasta que los registros del escaneo hayan sido confirmados por el destino: en modo dry-run, cuando el resumen se ha generado y emitido; en el envío a servidor (fase 2), solo ante respuesta 2xx del ingest. Ante un fallo, el estado previo SHALL conservarse intacto para que la siguiente ejecución reprocese lo pendiente sin pérdida de datos.

#### Scenario: Fallo antes de confirmar
- **WHEN** el proceso falla después de parsear registros pero antes de confirmarlos
- **THEN** `collector-state.json` conserva los cursores anteriores y el siguiente escaneo vuelve a emitir esos registros

#### Scenario: Dos ejecuciones consecutivas sin datos nuevos
- **WHEN** se ejecuta `run` dos veces seguidas sin actividad nueva de los agentes
- **THEN** la segunda ejecución no re-parsea ficheros ya confirmados y no produce registros duplicados

### Requirement: Rendimiento del escaneo
Un escaneo con ~30 días de logs de Claude Code y Codex SHALL completarse en menos de 30 segundos en frío (sin estado) y en menos de 2 segundos en modo incremental.

#### Scenario: Escaneo incremental rápido
- **WHEN** se ejecuta `run` inmediatamente después de otro `run` exitoso sobre 30 días de logs
- **THEN** el escaneo incremental termina en menos de 2 segundos
