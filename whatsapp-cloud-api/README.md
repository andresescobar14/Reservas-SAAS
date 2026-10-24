# Reserva · Meta WhatsApp Cloud API

La aplicación completa está en **`server.js`**: Express, Axios, reglas de planes, autorización multi-tenant, cifrado de tokens, webhooks, worker y adaptadores de BD. `schema.sql` añade las tablas privadas al Supabase existente. El mock asíncrono está incluido para ejemplos/pruebas; se rechaza en producción.

## Estado de activación

El código y sus pruebas se ejecutan localmente. Se crearon en Meta el portfolio **Reserva** (`3184492871743814`) y la app **Reserva Recordatorios** (`2016633605668910`), con el caso de uso WhatsApp. [Abrir la app en Meta](https://developers.facebook.com/apps/2016633605668910/dashboard/).

Meta asignó los recursos de prueba: Phone Number ID `1365161920020622`, cuenta de mensajes/WABA `2283544895546657` y Graph API `v25.0`. Son identificadores, no tokens de acceso. El destinatario autorizado se verificó y la prueba desde el panel de Meta llegó al estado **`read`** en sus webhooks. Esto verifica la conexión de prueba de Meta; todavía no verifica el envío desde este microservicio ni desde el dashboard.

La configuración local `.env`, excluida de Git, usa el puerto 3002 y contiene claves aleatorias de webhook, cifrado y firma, además de `META_APP_SECRET` para validar las firmas de Meta. El token de prueba autorizado se guardó cifrado como `META_TEST_ACCESS_TOKEN_ENCRYPTED`, junto con sus IDs `META_TEST_PHONE_NUMBER_ID` y `META_TEST_WABA_ID`. Esas variables son material de configuración para el alta de la empresa; el servidor sigue leyendo las credenciales de cada empresa desde la BD. El token de prueba es temporal y no sustituye la credencial de producción. La conexión privada PostgreSQL `DATABASE_URL` ya funciona con TLS verificado y el certificado oficial de Supabase. Se usa el rol `reserva_whatsapp`, sin privilegios de administrador ni permisos para modificar planes, aprobar pruebas o guardar consentimientos. Su credencial está en la configuración privada local y de Railway.

**Infraestructura desplegada y conectada a Supabase.** La migración `schema.sql` y los permisos `runtime-role.sql` están aplicados en el Supabase real. El servicio [WhatsApp Cloud API](https://whatsapp-cloud-api-production-de1d.up.railway.app/health) devuelve HTTP 200 con PostgreSQL; el webhook es `https://whatsapp-cloud-api-production-de1d.up.railway.app/webhook`. Meta verificó la URL con HTTP 200. **Los recordatorios de producción siguen pendientes del número oficial, token permanente, plantilla aprobada y publicación de la app. No se han enviado recordatorios desde este backend.** El motor anterior `whatsapp-engine/` y su pantalla QR son independientes; este servicio utiliza la API oficial y no genera códigos QR.

Estas reglas corresponden al nuevo backend de WhatsApp. La landing, el checkout y la prueba general del dashboard aún tienen el modelo anterior; no se han migrado precios ni cobrado suscripciones.

| Plan    | Precio       | Cuota                | Requisitos                         |
| ------- | ------------ | -------------------- | ---------------------------------- |
| TRIAL   | Gratis       | 35 en toda la prueba | 7 días, ACTIVO y aprobación manual |
| PRO     | $599 MXN/mes | 1,000 al mes         | ACTIVO y suscripción vigente       |
| PREMIUM | $999 MXN/mes | 2,500 al mes         | ACTIVO y suscripción vigente       |

## Instalar y probar

Desde esta carpeta:

```powershell
npm ci
npm test
Copy-Item .env.example .env
```

En Bash: `cp .env.example .env`. Completa las variables antes de `npm start`. Para no ocupar el puerto del motor QR local usa `PORT=3002`. Railway inyecta `PORT`; el valor por defecto es `process.env.PORT || 3001`, escuchando en `0.0.0.0`.

`DB_MODE=postgres` usa `DATABASE_URL` con TLS verificado; puede utilizarse la conexión PostgreSQL o el pooler de Supabase. Si requiere un certificado propio, coloca su CA PEM en `PG_CA_CERT`. No desactives la validación TLS. `DATABASE_URL` y todos los secretos son exclusivos del servidor.

## Activar Meta desde cero

1. Inicia sesión en [Meta Developers](https://developers.facebook.com/apps/), completa el registro de desarrollador si se solicita y crea la aplicación con el producto/caso de uso WhatsApp. Asocia el negocio y su cuenta de WhatsApp Business. Para incorporar negocios de terceros necesitarás completar el proceso de permisos/revisión que Meta muestre para tu aplicación; una app de prueba no habilita por sí sola a todas las clínicas.
2. En la configuración de la app obtén **App Secret**, la versión de Graph API soportada y el **Phone Number ID**. Configura `META_APP_SECRET` y `META_GRAPH_VERSION`. El token de producción debe tener acceso al número/WABA correspondiente y permiso `whatsapp_business_messaging`; el token temporal de pruebas no es una credencial permanente.
3. Crea en WhatsApp Manager la plantilla **`recordatorio_cita`**, categoría **UTILITY**, idioma **Spanish (MEX) / `es_MX`**, con tres variables posicionales en este orden: nombre, fecha y hora. Ejemplo de cuerpo: `Hola {{1}}, te recordamos tu cita el {{2}} a las {{3}}. Confirma o cancela usando los botones.` Añade botones **Quick reply**: índice 0 **Confirmar**, índice 1 **Cancelar**. Espera su aprobación antes de marcar `template_approved=true` para esa empresa. La categoría y los títulos se definen al crear la plantilla, no al enviarla.
4. Genera `WEBHOOK_VERIFY_TOKEN` y `BUTTON_SIGNING_SECRET` aleatorios (al menos 32 caracteres), y `META_TOKEN_ENCRYPTION_KEY` con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Conserva la clave de cifrado: cambiarla requiere volver a cifrar los tokens almacenados.
5. Ejecuta `schema.sql` como administrador en la BD donde ya existen `public.companies`, `customers` y `reservations`. El esquema privado `whatsapp_cloud` no debe exponerse mediante la API pública de Supabase. Configura `DATABASE_URL`, la URL de Supabase y su clave pública en el servidor.
6. Da de alta cada `company_id` existente en `whatsapp_cloud.companies`. Guarda el token específico cifrado, su Phone Number ID y la aprobación real de la plantilla. Un número oficial pertenece a una empresa; es único. El TRIAL se crea con `whatsapp_acceso_aprobado=false` y solo un administrador puede aprobarlo. No hay endpoint público para aprobar planes o permisos.
7. Registra en `whatsapp_cloud.consents` la aceptación del paciente, con teléfono internacional **solo dígitos** (`52` + 10 dígitos para México), `opted_in_at` y `revoked_at=null`. La cita debe existir, estar activa, ser futura y coincidir con la fecha/hora en la zona del negocio (`America/Mexico_City` por defecto). Si hay varias citas coincidentes, se rechaza el envío para no modificar una cita equivocada.
8. Publica el servicio y registra `https://DOMINIO_REAL/webhook` en Meta con el mismo `WEBHOOK_VERIFY_TOKEN`. Suscribe el campo `messages` y la aplicación a las cuentas WABA de los negocios. La verificación GET sola no suscribe automáticamente todas las cuentas. Prueba con el número/los destinatarios autorizados por Meta antes de activar números reales.

### Guardar el token de una clínica

`encryptToken()` está exportada desde `server.js`. Para obtener el valor cifrado sin poner el token en el historial de comandos, desde esta carpeta, con `.env` ya configurado:

```powershell
node -e "let t='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>t+=x);process.stdin.on('end',()=>{const s=require('./server');console.log(s.encryptToken(t.trim(),process.env.META_TOKEN_ENCRYPTION_KEY));});"
```

Introduce el token directamente en la entrada de ese proceso y termina la entrada (PowerShell: Ctrl+Z y Enter; Bash: Ctrl+D). El resultado cifrado se guarda en `whatsapp_cloud.companies.whatsapp_token_oficial` desde una sesión administrativa. No copies el token ni `DATABASE_URL` al chat o a GitHub. La migración incluye ejemplos de alta, aprobación y suspensión; no contiene secretos.

## Contrato HTTP

### `POST /api/whatsapp/send`

Cabeceras: `Content-Type: application/json`, `Authorization: Bearer <sesión Supabase>` y `Idempotency-Key: <clave única por intento lógico>`.

```json
{
  "companyId": "UUID_DE_LA_EMPRESA",
  "phone": "+525555555555",
  "patientName": "Ana López",
  "date": "2026-12-10",
  "time": "10:00"
}
```

El usuario autenticado debe ser propietario de la empresa. Antes de llamar a Meta se comprueban empresa, estado, vigencia, aprobación, cuota, consentimiento, credenciales y cita. No se acepta un `companyId` ajeno. Los límites se calculan en PostgreSQL bajo bloqueo y no pueden cambiarse desde el navegador.

Endpoint oficial de envío: `https://graph.facebook.com/{META_GRAPH_VERSION}/{whatsapp_phone_id}/messages`. Usa Axios con timeout, sin redirecciones ni reintentos automáticos, y el token de esa clínica. Meta debe devolver un ID de mensaje para registrar éxito. Éxito significa **aceptado por Meta**, no entregado o leído.

- 400: entrada/fecha/hora/clave de idempotencia inválida.
- 401: sesión ausente o vencida.
- 403: suspensión, prueba pendiente/vencida, límite, falta de configuración o consentimiento.
- 404: empresa inexistente o ajena.
- 409: cita ambigua, clave reutilizada con otros datos o envío pendiente de conciliación.
- 502: Meta rechazó expresamente la petición.
- 503: BD/auth no disponible o resultado de envío incierto.

### Cuotas y reintentos

`usage.sent` es el contador autoritativo; `reserved` impide que dos solicitudes consuman la última unidad simultáneamente. TRIAL usa el bucket permanente `TRIAL`; PRO/PREMIUM usan meses calendario en la zona del negocio. La operación se contabiliza en el periodo en que se reservó su cuota. No se borran cuotas anteriores al empezar otro mes.

Una respuesta válida de Meta convierte la reserva en `sent` e incrementa el contador. Un rechazo explícito 4xx libera la reserva. Si hay timeout, error de red o 5xx, conserva la reserva y marca `unknown`: Meta podría haber aceptado el mensaje. **No reenviar automáticamente ni cambiar la Idempotency-Key para sortear ese estado.** El administrador debe conciliar `outbox` con Meta y resolver el estado usando `db.finish(id, 'sent', messageId)` o `'failed'` únicamente cuando conozca el resultado. Un fallo/crash entre la respuesta de Meta y la confirmación en BD también necesita conciliación. No se afirma entrega exactamente una vez entre dos sistemas sin una transacción compartida.

### `GET /webhook`

Valida `hub.mode=subscribe`, `hub.verify_token` y devuelve `hub.challenge` como texto, sin convertirlo a número.

### `POST /webhook`

Valida `X-Hub-Signature-256` sobre los bytes originales con `META_APP_SECRET`. Recorre todos los `entry/changes/messages`, acepta `button` y `interactive.button_reply`, persiste una bandeja de entrada deduplicada y responde 200 sin esperar la actualización de la cita. El worker recupera los pendientes después de un reinicio y admite réplicas mediante `FOR UPDATE SKIP LOCKED`.

No se devuelve 200 a una firma falsa (403), JSON inválido (400) o un evento que no pudo persistirse (503): Meta debe poder reintentar un fallo real. Esto evita confirmar silenciosamente un evento perdido.

La clínica se resuelve por `metadata.phone_number_id`, y la cita por un payload firmado o el contexto del mensaje enviado. También se comprueba el remitente; nunca se busca la clínica solo por el teléfono del paciente. Confirmar mantiene `confirmed`; cancelar cambia a `cancelled`. Las citas canceladas/completadas/pasadas no se reactivan mediante botones antiguos. Los eventos repetidos no duplican la operación. Errores repetidos quedan en `inbox.state='failed'` para revisión; no se registran tokens, mensajes o teléfonos en logs.

## Railway

Servicio independiente con **Root Directory `/whatsapp-cloud-api`**, Dockerfile autodetectado, Healthcheck `/health`, variables de `.env.example` y dominio HTTPS. Conservar la ejecución continua para el worker; el servicio no necesita Chromium, disco de sesiones ni QR. La base de datos debe ser PostgreSQL persistente. `npm start` también sirve para un despliegue Node sin Docker.

Despliegue confirmado `af703777-3bf5-4e37-9331-e36a3d22dbf7`, servicio `whatsapp-cloud-api`, proyecto `reserva-whatsapp-cloud-api`. Se subió un paquete de código con Dockerfile, package.json, package-lock.json, server.js y railway.json; no se subieron `.env`, `.cache`, credenciales ni el token temporal de prueba. Las variables necesarias se configuraron por separado en Railway. El token de prueba permanece cifrado solo localmente.

Pruebas reales: `/health` 200, envío sin sesión 401, webhook sin token correcto 403 y evento firmado vacío 200. Meta verificó el callback con HTTP 200. Antes de enviar recordatorios reales, aprovisionar empresa/consentimiento/plantilla y comprobar un envío y su respuesta de botón con Meta. Railway construyó la imagen Docker; no hay Docker instalado en este equipo.

Para reinstalar permisos en otra BD: crear el LOGIN limitado con una contraseña privada y ejecutar `runtime-role.sql` como administrador después de `schema.sql`. Las aprobaciones y cambios de plan deben ejecutarse desde una sesión administrativa; el proceso de Railway no puede realizarlos.

## Alcance de esta entrega

Incluye envío solicitado por HTTP y recepción/actualización de citas. El worker procesa **webhooks recibidos**; no recorre todavía las reservas para generar recordatorios automáticamente 24 horas antes. No crea cargos ni verifica pagos: `status_pago`, `plan_actual` y `subscription_ends_at` deben actualizarse desde un administrador o una integración de cobros verificada. La página `/dashboard/whatsapp` usa esta API oficial con botón **Actualizar estado** y verificación de propietario. La demo y el motor QR anterior se conservan separados. La landing y el checkout no se modificaron.

Referencias oficiales del formato: [plantillas](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/types/TemplateObject/), [botones quick reply](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/types/component_object/), [validación de webhooks](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/). Estas páginas documentan el protocolo; no se utiliza el SDK archivado como dependencia. La versión Graph se configura desde tu app.

## Estado del dashboard y costos

`GET /api/whatsapp/status/:companyId` requiere el JWT de Supabase y verifica el propietario. Devuelve únicamente estado, requisitos de alta, plan y contadores; no expone tokens, IDs de teléfono ni datos de pacientes. `PENDING_SETUP` indica que falta el alta oficial; `BLOCKED`, que acceso o cuota impiden enviar; `READY`, que la configuración de BD permite solicitar envíos, sin afirmar que Meta haya validado el token en tiempo real. Actualizar no modifica credenciales ni aprueba planes.

Vercel: proyecto original `reservas-saas-ae`, despliegue `dpl_5ecoQ3sjuQHJutKdnj5vmkCeeJ1z`, alias https://reservas-saas-ae.vercel.app. Variable del servidor Next.js: `WHATSAPP_CLOUD_API_URL=https://whatsapp-cloud-api-production-de1d.up.railway.app`. El webhook fue verificado por Meta y la prueba `messages` enviada desde su panel fue exitosa; solo está suscrito el campo `messages` (v26.0). El envío sigue usando la versión configurable v25.0 asignada durante el alta.

Tarifa consultada el 22 de octubre de 2026 en la [calculadora oficial](<https://whatsappbusiness.com/products/platform-pricing/?country=Mexico&currency=Mexican%20Peso%20(MXN)&category=Utility>): México, MXN, Utility = $0.1565 por mensaje entregado. 1,000 mensajes a esa tarifa: $156.50; 2,500: $391.25, antes de eventuales impuestos/descuentos. La tarifa puede cambiar; no está fija en el código. Los cargos de Meta, el alojamiento de Railway y la suscripción del SaaS se administran por separado. No se ha añadido un método de pago ni contratado una suscripción adicional durante esta configuración.

Verificación autenticada completada en producción con la empresa Ejemplo-reservas: el dashboard devolvió `PENDING_SETUP` desde PostgreSQL y el botón Actualizar estado cambió la hora de comprobación sin errores. No se aprovisionó ni aprobó artificialmente la empresa para ocultar los requisitos pendientes. 24 pruebas del backend pasaron; lint del componente y verificación TypeScript de Next.js, correctos.
