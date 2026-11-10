# Aprender y operar el flujo de WhatsApp de Reserva

> Guía anterior de compatibilidad con Make. El flujo vigente usa automatización propia: [WhatsApp sin Make](whatsapp-sin-make.md). Make está desactivado por defecto; no utilizar esta guía para nuevas instalaciones.

## Qué hace cada herramienta

```mermaid
flowchart LR
  C[Cal.com: reserva y consentimiento] --> M[Make: decide cuándo ejecutar]
  M -->|Clave propia de la empresa| R[Railway: valida y sincroniza]
  R --> D[(Supabase: cita, cuota y envío)]
  R -->|Plantilla aprobada| W[Meta Cloud API]
  W --> P[WhatsApp del cliente]
  P -->|Confirmar / Cancelar| H[Webhook firmado de Railway]
  H --> D
  D --> V[Dashboard de Reserva en Vercel]
```

**Make conserva la programación del envío.** El worker de Railway procesa las respuestas de Meta; no crea un segundo programador de recordatorios. Un escenario puede enviar al crear la reserva o llamar después con `event: "remind"`. No se deben dejar Evolution API y Meta enviando la misma notificación.

## 1. Preparar Meta una vez como proveedor

En la app «Reserva Recordatorios», configura Facebook Login for Business con la variación **WhatsApp Embedded Signup / Cloud API**. Guarda el ID de configuración en `META_SIGNUP_CONFIG_ID` y el ID de app en `META_APP_ID`. No uses el ID de una plantilla de mensajes como ID de configuración.

Habilita el dominio HTTPS real del dashboard en los dominios de JavaScript SDK y los ajustes de OAuth que solicite Meta. El acceso JS SDK y la configuración deben corresponder a la misma app. Usa acceso mínimo para WhatsApp: gestión de cuentas y mensajería; no actives catálogos, anuncios o facturación compartida si no los necesitas. La publicación, revisión de permisos, alta como proveedor de tecnología y verificación del negocio dependen de Meta. Una configuración guardada no equivale a estar aprobado para conectar negocios externos.

Suscribe el webhook de la app a `messages`, `account_update`, `history`, `smb_app_state_sync` y `smb_message_echoes`. El servidor también suscribe cada WABA durante el alta. El callback es el dominio público de Railway seguido de `/webhook`; el token de verificación y el secreto de app permanecen privados.

Después de verificar la configuración completa, activa `META_SIGNUP_ENABLED=true`. Mantén `false` si faltan permisos o no existe un ID de configuración real.

Referencias oficiales: [implementación](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation/), [Coexistencia](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/), [alta como proveedor](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider/).

## 2. Conectar el número de un negocio

1. El cliente necesita administrar su portfolio y usar el número en **WhatsApp Business**. Si usa WhatsApp personal, debe preparar la migración a la app Business por separado, conservando sus copias de seguridad; Reserva no borra ni migra su cuenta.
2. En Reserva → WhatsApp, lee las instrucciones y marca que administras el negocio.
3. Pulsa **Preparar conexión**, después **Continuar con Meta**. Son dos clics para que el navegador permita abrir el asistente.
4. Meta muestra el negocio, activos y permisos. El cliente revisa y autoriza allí. Sigue las instrucciones de su móvil. Debe elegir el flujo que conserva la app Business.
5. Pulsa **Finalizar**. El código OAuth dura aproximadamente 30 segundos; Reserva lo intercambia inmediatamente en el servidor. No se pide pegar tokens en el chat o en Make.
6. El backend comprueba la app que emitió el token, la relación WABA/número y `is_on_biz_app=true` junto a `platform_type=CLOUD_API`. Si Meta no confirma Coexistencia, el alta se rechaza sin llamar a `/register` ni desconectar el móvil.
7. **Comprobar en Meta** consulta el estado real de la conexión y la plantilla. El panel de uso muestra por separado la vigencia del plan, aprobación y cuota.

El token se cifra con AES-256-GCM. La sesión de alta dura 10 minutos y se liga al propietario y empresa con un nonce de un solo uso. Las sesiones incompletas se limpian. No se aprueba un TRIAL por conectar un número.

## 3. Plantilla y pagos

Si falta `recordatorio_cita`, el dashboard ofrece enviarla a revisión. Es de categoría **UTILITY**, idioma `es_MX`, con tres parámetros de cuerpo en este orden: nombre, fecha y hora; dos botones quick reply: **Confirmar** y **Cancelar**. Meta puede rechazarla o cambiar su estado; el envío solo se habilita cuando la comprobación verifica la versión compatible aprobada.

El negocio gestiona su método de pago y los cargos de Meta en [WhatsApp Manager](https://business.facebook.com/wa/manage/home/). La tarifa de Meta depende del país del destinatario y categoría; consulta [precios oficiales](https://business.whatsapp.com/products/platform-pricing). Reserva no añade una tarjeta ni cobra automáticamente desde esta integración.

Planes de WhatsApp del motor:

| Plan | Precio de Reserva | Cuota | Condiciones |
| --- | --- | --- | --- |
| TRIAL | $0 | 35 en total | 7 días y aprobación manual |
| PRO | $599 MXN/mes | 1,000 por mes | Pago vigente |
| PREMIUM | $999 MXN/mes | 2,500 por mes | Pago vigente |

Un administrador o un webhook de cobro validado debe asignar el plan tras verificar el pago. Make y la clave de integración no pueden cambiar planes, pagos o aprobar pruebas. Los precios de la landing antigua son independientes y deben actualizarse cuando se cambie la oferta comercial.

## 4. Sustituir Evolution API en Make

En Reserva → Integraciones, genera una clave. Solo se muestra una vez y caduca en 90 días. La base de datos guarda su hash. Copia la clave únicamente en la conexión privada del módulo HTTP de Make. Reemplazarla invalida inmediatamente la anterior; revocarla detiene el acceso de ese escenario.

Configura el módulo:

```http
POST https://TU_SERVICIO_RAILWAY/api/integrations/make/events
Authorization: Bearer CLAVE_PRIVADA_DE_ESTA_EMPRESA
Content-Type: application/json
```

Primero prueba la sincronización **sin envío**. Los nombres de propiedades de Cal.com dependen del módulo que uses; mapea datos observados en una ejecución real, no copies los marcadores literalmente:

```json
{
  "event": "created",
  "bookingId": "UID_ESTABLE_DE_CAL",
  "eventAt": "2026-10-31T14:00:00Z",
  "patientName": "Nombre del cliente",
  "phone": "+525555555555",
  "startsAt": "2030-12-01T16:00:00Z",
  "endsAt": "2030-12-01T17:00:00Z",
  "service": "Consulta",
  "whatsappConsent": false,
  "consentEvidence": "MAPEAR_RESPUESTA_AFIRMATIVA_REAL",
  "sendReminder": false
}
```

`bookingId` es estable incluso al reintentar. `eventAt` es la fecha real del evento fuente; no le pongas una fecha más reciente a un webhook antiguo. Todas las fechas requieren zona horaria. El teléfono usa formato internacional, sin el sufijo `@s.whatsapp.net` de Evolution.

Añade en Cal.com una pregunta de autorización para recordatorios de WhatsApp y mapea su respuesta. Solo usa `whatsappConsent: true` cuando exista una respuesta afirmativa real y una evidencia que describa esa autorización. Un teléfono o contacto importado por sí solo no es consentimiento. Las citas sin autorización se importan, pero su recordatorio se bloquea.

Comprueba que la cita aparece en Reserva. Después, con número, plantilla, plan y acceso preparados, `sendReminder: true` solicita un recordatorio al recibir la reserva. No envíes texto libre ni tokens de Meta en este módulo: el servidor usa la plantilla y credencial de la empresa.

Para enviar más tarde desde la programación existente de Make:

```json
{
  "event": "remind",
  "bookingId": "UID_ESTABLE_DE_CAL",
  "startsAt": "2030-12-01T16:00:00Z"
}
```

La cita debe estar sincronizada previamente y conservar esa fecha. Si fue reprogramada, un recordatorio de la fecha antigua devuelve `STALE_BOOKING`.

Para reprogramar, usa `event: "rescheduled"`, los campos de una creación y el nuevo `eventAt`. Algunos flujos de Cal.com generan un nuevo UID al reprogramar: en ese caso, sincroniza la cancelación del UID anterior y la creación del nuevo, según los eventos reales recibidos. Para cancelar:

```json
{
  "event": "cancelled",
  "bookingId": "UID_ESTABLE_DE_CAL",
  "eventAt": "2026-10-31T15:00:00Z"
}
```

Este evento actualiza el dashboard y no manda otro WhatsApp. No agrega automáticamente una cancelación en Cal.com cuando el paciente cancela desde WhatsApp: la respuesta actualiza Reserva. La propagación de esa respuesta hacia Cal.com requiere conectar su API o un webhook saliente específico; no está activada por este endpoint.

## 5. Cómo se evita un duplicado y se procesa una respuesta

1. La clave de Make identifica una sola empresa. El backend no confía en un `companyId` arbitrario del JSON.
2. La importación conserva un vínculo único entre UID de Cal.com y cita de Reserva. Los eventos antiguos se ignoran; una versión idéntica con datos contradictorios se rechaza.
3. El envío genera una clave idempotente según UID y horario. Dentro de una transacción PostgreSQL reserva cuota antes de contactar con Meta.
4. Solo un éxito con identificador de mensaje incrementa enviados. Un timeout conserva la reserva de cuota y exige conciliación; no se reenvía con otra clave.
5. Meta firma los webhooks. Se persisten antes de responder 200 y un worker procesa cada evento una vez.
6. Un botón se asocia al número emisor, paciente, identificador de mensaje/cita y horario original. Un botón de una cita antigua no cancela la nueva fecha.

## 6. Entender los resultados

| Resultado | Significado / siguiente acción |
| --- | --- |
| `synced: true, sent: false` | Cita importada; no se pidió enviar o el evento era antiguo/cancelación |
| `success: true` | Meta aceptó el mensaje; todavía puede estar pendiente de entrega |
| `replayed: true` | Ya se había aceptado ese envío; no se mandó otro |
| `TRIAL_REVIEW` | Administrador debe revisar y aprobar el acceso de prueba |
| `CONSENT_REQUIRED` | Falta autorización afirmativa en la cita o el consentimiento fue revocado |
| `MESSAGE_LIMIT` | Se agotó la cuota; no reintentar para saltarla |
| `META_NOT_CONFIGURED` | Falta número, credencial o plantilla compatible aprobada |
| `META_REJECTED` | Meta rechazó el envío; revisar cuenta/plantilla/credencial |
| `SEND_OUTCOME_UNKNOWN` / `ACCOUNTING_PENDING` | No forzar un nuevo envío; comprobar el identificador y conciliar |
| `INVALID_AUTOMATION_KEY` | Clave vencida/revocada; generar otra y actualizar Make |
| `STALE_BOOKING` | La fecha ya cambió; usar el evento vigente |

En Integraciones, **Actualizar** consulta el último resultado recibido por empresa. Los errores no contienen el token de Meta ni la clave de Make.

## 7. Coexistencia, historial y desconexión

El alta solicita una vez la sincronización de contactos e historial, dentro del plazo de 24 horas de Meta. Cada solicitud guarda su estado; un timeout no provoca otra solicitud automática. La respuesta `2593109` significa que el negocio decidió no compartir historial y es válida. Recibir la aceptación del POST no se muestra como sincronización completa: se espera el progreso de los webhooks.

La actividad de mensajes se cifra y se conserva hasta siete días desde su recepción. No se descargan medios ni se convierten contactos en clientes con consentimiento. Se muestran los últimos 25 mensajes recibidos, compartidos o enviados desde el móvil. Los eventos de sincronización de contactos se usan para estado técnico; no se copia toda la agenda a `public.customers`.

Desconectar desde Reserva borra la credencial y detiene los envíos localmente. Para retirar también el permiso en Meta, el negocio usa WhatsApp Business → Ajustes → Cuenta → Plataforma de WhatsApp Business → Desconectar. `PARTNER_REMOVED` o `ACCOUNT_OFFBOARDED` detienen el acceso del servidor. La reconexión requiere verificar los permisos de nuevo; no reactiva automáticamente un token antiguo.

## Despliegue y permisos de base de datos

Orden de migraciones: `schema.sql`, `runtime-role.sql`, `onboarding.sql`, `automation.sql`. Se ejecutan con el administrador de Supabase, no con una clave pública ni desde el navegador del cliente. El runtime limitado añade conexión, sesiones, actividad, claves de automatización, importación de clientes/citas y registro de consentimiento explícito; continúa sin permisos para aprobar pruebas, cambiar planes o modificar pagos.

Validación local: `npm test` en la raíz, `npm test --prefix whatsapp-cloud-api`, `npm run typecheck`, `npm run lint`, `npm run build`. Las pruebas PostgreSQL con el rol limitado comprueban el flujo y los rechazos. No sustituyen la prueba real del número, permisos y plantilla de Meta.
