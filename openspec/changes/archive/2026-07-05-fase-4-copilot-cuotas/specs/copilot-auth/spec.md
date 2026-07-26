## ADDED Requirements

### Requirement: Login por device-flow OAuth de GitHub
El colector SHALL exponer el comando `tokenviewer-collector copilot login`, que MUST ejecutar el device-flow OAuth de GitHub: solicitar un código de dispositivo a `POST https://github.com/login/device/code` con el client-id de la extensión oficial de VS Code y scope `read:user`, mostrar al usuario el `user_code` y la URL de verificación, y hacer polling a `POST https://github.com/login/oauth/access_token` hasta obtener el token de acceso.

#### Scenario: Login completado con éxito
- **WHEN** el usuario ejecuta `tokenviewer-collector copilot login` y autoriza el código en github.com antes de que expire
- **THEN** el colector obtiene el token OAuth, lo persiste en su config y muestra un mensaje de éxito con la cuenta autenticada

#### Scenario: El usuario aún no ha autorizado
- **WHEN** el polling recibe el error `authorization_pending`
- **THEN** el colector sigue esperando y reintenta respetando el `interval` indicado por GitHub, sin mostrar error

#### Scenario: GitHub pide reducir el ritmo
- **WHEN** el polling recibe el error `slow_down`
- **THEN** el colector incrementa el intervalo de polling en al menos 5 segundos antes del siguiente intento

#### Scenario: Código de dispositivo expirado
- **WHEN** el polling recibe el error `expired_token` porque el usuario no autorizó a tiempo
- **THEN** el colector termina con un error claro que indica repetir `copilot login`

### Requirement: Almacenamiento del token con permisos 0600
El colector SHALL guardar el token OAuth de GitHub en su fichero de configuración local y MUST dejar ese fichero con permisos `0600` tras escribirlo. El token MUST NOT enviarse nunca al servidor de TokenViewer.

#### Scenario: Permisos tras el login
- **WHEN** el login termina con éxito y el token se escribe en el config
- **THEN** el fichero de configuración queda con permisos `0600` (lectura/escritura solo para el propietario)

#### Scenario: El token no viaja al servidor
- **WHEN** el colector envía cualquier petición al servidor de TokenViewer (ingesta de registros o de snapshots)
- **THEN** el cuerpo y las cabeceras contienen solo el `machineToken` y los datos de uso/cuota, nunca el token OAuth de GitHub

### Requirement: Estado y cierre de sesión de Copilot
El colector SHALL permitir consultar si hay sesión de Copilot configurada y SHALL permitir eliminar el token almacenado (logout), dejando el resto de la configuración intacta.

#### Scenario: Consulta de estado con sesión activa
- **WHEN** el usuario consulta el estado de Copilot (p. ej. `tokenviewer-collector copilot status`) con un token guardado
- **THEN** el colector indica que hay sesión configurada sin imprimir el token completo

#### Scenario: Logout
- **WHEN** el usuario ejecuta el cierre de sesión de Copilot (p. ej. `tokenviewer-collector copilot logout`)
- **THEN** el token se elimina del config, el resto de la configuración se conserva y los siguientes `run` omiten el paso de Copilot
