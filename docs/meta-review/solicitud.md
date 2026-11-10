# Reservas - Codesc: preparación de revisión de Meta

Estado comprobado el 9 de noviembre de 2026. El piloto directo usa la app **Reservas Codesc** (`1451308149826134`) del portfolio **Andres's Prueba** (`1712085223855914`), propietario del número dedicado. La app quedó **publicada** con autorización expresa. La app anterior `2016633605668910`, del portfolio `3184492871743814`, y su solicitud `2026083411390596` se conservan como antecedentes. Publicar esta app no acredita aprobación de acceso avanzado a activos de otros negocios.

## Estado actual: conexión directa, sin Embedded Signup

El propietario eligió un número dedicado a Cloud API. Embedded Signup y Coexistencia ya no son el flujo activo. `META_SIGNUP_ENABLED=false`, la lista de empresas de prueba está vacía y `LEGACY_MAKE_ENABLED=false`. La documentación operativa vigente es [WhatsApp sin Make](../whatsapp-sin-make.md).

- Railway devuelve HTTP 200 en `/health`, con proveedor `meta-cloud` y PostgreSQL. El despliegue `85e183cb-a3da-423a-a6fc-169b845e42eb` terminó en SUCCESS después de configurar privadamente el identificador y la clave de la nueva app. No se modificó la clave de cifrado de las credenciales ni el token de verificación del webhook.
- Se creó «Reservas Codesc Automatizaciones» (`61596360092357`) como Employee, con Desarrollar app en la nueva app, acceso parcial a las plantillas y Mensajes en el teléfono dedicado. Los tres activos quedaron asignados y comprobados después de recargar Meta. Se generó y guardó cifrado un token de 60 días con `whatsapp_business_management` y `whatsapp_business_messaging`, con autorización expresa del propietario.
- La nueva credencial permite consultar la cuenta de mensajes `1776422760311269` y el Phone Number ID `1483697451489898`. Se validaron app, permisos, vencimiento y relación entre activos. El número dedicado 4553 se conectó mediante el formulario del SaaS con la sesión del propietario y su token quedó cifrado en la base. Vence el 8 de enero de 2027 a las 21:19 UTC y deberá renovarse antes. Las dos plantillas continúan PENDING.
- El callback de Railway quedó verificado y guardado en la nueva app, con `messages` suscrito. Después de publicarla, la prueba enviada desde Meta produjo POST `/webhook` HTTP 200 a las 21:48:41 UTC, confirmado en los registros HTTP de Railway con cliente Webhooks/1.0. Fue un evento sintético del panel; no acredita una respuesta de botón de un paciente ni entrega de mensajes salientes.
- En el portfolio «Andres's Prueba» (`1712085223855914`), la cuenta de mensajes `1776422760311269` se detectó desactivada el 9 de noviembre de 2026 por «incumplimiento de las Condiciones de uso aceptable». Tras solicitar la revisión, una consulta posterior a Configuración → Cuentas de mensajes muestra **Estado de la cuenta: Aprobada**, y WhatsApp Manager ya no muestra el aviso de cuenta inhabilitada. No se encontró una resolución escrita que explique la causa inicial. No atribuirla únicamente a falta de verificación comercial ni crear cuentas para eludir restricciones.
- Las plantillas `reserva_confirmacion` y `recordatorio_cita` están creadas en esa cuenta: categoría UTILITY, idioma `es_MX`, variables nombre/fecha/hora y botones Confirmar, Cambiar cita y Cancelar. Ambas figuran **En revisión**, no aprobadas.
- Con autorización expresa del propietario se envió la explicación preparada mediante «Solicitar revisión». Meta confirmó **Revisión solicitada**, con plazo habitual de 24 a 48 horas. La consulta posterior muestra la cuenta **Aprobada**. El comprobante, el texto enviado y la captura del estado actual se conservan en la caché privada local. El portfolio continúa **No verificado** y sin socio asignado. La pantalla de facturación confirma un método de pago asociado a la cuenta de mensajes. No se introdujeron ni modificaron datos de tarjeta. La aprobación de la cuenta no acredita acceso avanzado de la app ni entrega de mensajes.
- Con autorización expresa se reactivó únicamente Ejemplo-reservas (`53bd6a77-011c-4aba-b0e9-4c6b3c33f6dd`) como piloto interno gratuito de siete días, hasta el 16 de noviembre de 2026 a las 21:45 UTC, con aprobación manual de WhatsApp y límite de 35 mensajes totales. No se registró un pago ni se borraron consumos. La consulta posterior confirma TRIAL, ACTIVO, aprobación true, conexión CONNECTED, credencial cifrada, cero trabajos y automatización apagada. El rol de Railway conserva sus permisos limitados; el ajuste se ejecutó administrativamente en Supabase.
- No se envió la prueba desde el número dedicado al destinatario autorizado. La aprobación de una plantilla, un token válido o el estado «Conectado» del teléfono por separado no sustituyen la validación completa.

La recuperación de la cuenta, el acceso avanzado de la app para activos de otros negocios, la aprobación de plantillas y la facturación son condiciones distintas. Deben resolverse y comprobarse antes de habilitar clientes.

### Antecedentes después de la restitución (superados por el estado actual)

- El propietario decidió continuar sin verificar el negocio y añadir personalmente el método de pago. No se enviaron documentos comerciales ni se introdujeron datos de tarjeta.
- La nueva comprobación de la credencial vuelve a mostrar token válido y app correcta, pero sin acceso al activo: HTTP 400, código 100, subcódigo 33.
- Se hizo un único nuevo intento de la asignación ya autorizada, después de que la cuenta pasara a Aprobada. Solo se seleccionó administrar/ver plantillas, con acceso total apagado. Meta respondió «No se pudo asignar el socio. Vuelve a intentarlo más tarde». No quedó socio asignado y no se infiere la causa del rechazo.
- El portfolio propietario del número no tiene apps. Meta muestra deshabilitada la opción de crear una app y la cuenta de Facebook correspondiente debe completar Meta for Developers. Con autorización expresa del propietario se pulsó Continuar para aceptar las Condiciones de la plataforma y las Políticas para desarrolladores. El primer envío mostró un error al guardar; después de actualizar el formulario, Meta marcó Register como completado y avanzó a Verify account. La verificación del celular quedó pendiente de intervención del propietario, con Venezuela (+58) seleccionado y sin introducir ni enviar un número. Meta indica que guardará el celular en el perfil para acceso, notificaciones y personalización. El registro de desarrollador aún no está completo. Una app propia en ese portfolio es una opción para evaluar una prueba con activos propios; no acredita acceso público a cuentas de otros negocios.
- Las dos plantillas continúan En revisión en la nueva consulta. No se duplicaron ni se volvieron a enviar.
- La consulta de PostgreSQL confirma las tablas de automatización disponibles, una configuración apagada, cero trabajos y acceso TRIAL sin aprobación. No se modificaron planes, pagos, consentimiento ni cuotas. La credencial de Meta no se guardó como conexión de la empresa mientras la validación del activo siga fallando.

Las revisiones fechadas del 3 al 5 de noviembre que siguen son un registro histórico de los intentos anteriores con Embedded Signup; no son instrucciones para el flujo actual.

## Revisión del 5 de noviembre de 2026

- Se abrió el dashboard original con la sesión del propietario. La empresa continúa sin número conectado, con TRIAL sin aprobar y suscripción del SaaS vencida. Consultar/configurar WhatsApp no levanta los bloqueos de envío.
- La configuración `1129741769644373` muestra explícitamente «Registro insertado de WhatsApp», WhatsApp Cloud API, token de usuario del sistema y los dos permisos de WhatsApp. No se creó otra configuración ni se ampliaron sus permisos.
- El código de lanzamiento ahora declara `extras.version: "v4"`, conserva `featureType: "whatsapp_business_app_onboarding"` y no acepta un login genérico como conexión. Muestra ayuda si no avanza el asistente y finaliza con instrucciones si llega autorización sin evento de alta de Coexistencia. La prueba de cancelación comprueba que una respuesta tardía no reactiva la espera.
- En Facebook Login se observó «Inicio de sesión de OAuth de navegador integrado» desactivado. El propietario autorizó activarlo y guardar. Se pulsaron ambos controles; la recarga posterior para comprobar persistencia fue bloqueada por un fallo 403 del sistema de revisión automática del navegador. No afirmar que el valor quedó guardado hasta comprobarlo en Meta. No se intentó eludir el bloqueo mediante otro navegador o API.
- El administrador de registro insertado sigue indicando que no se pueden incorporar usuarios hasta verificar el negocio y que producción requiere revisión de la app y verificación de acceso. Esto es independiente de los ajustes de OAuth.
- Pruebas del SDK: 6/6; pruebas de onboarding del backend: 12/12; typecheck, lint y comprobación de espacios correctos. Son pruebas automatizadas; no acreditan que el número personal esté conectado ni que haya recibido un recordatorio real.
- Publicación terminada: Vercel `dpl_CQSJKfXcEfKmWgCLY1paUDfde1Wv` muestra Ready y el dominio `reservas-saas-ae.vercel.app`. La compilación remota terminó correctamente. Se abrió la página privada del dominio original y se observaron las nuevas condiciones de Coexistencia, la respuesta de la API y el TRIAL sin aprobar. La respuesta tardía del CLI produjo también `dpl_5V3UDvgqNj4m1tgfCxJ3vwkmrSzu`; ambos contienen la misma corrección de frontend. No generar otro despliegue para continuar con el diagnóstico de Meta.
- El panel explica los efectos publicados por Meta: la app móvil se mantiene en Coexistencia, pero los dispositivos vinculados se desvinculan y varias funciones cambian. No se promete riesgo cero. El servidor mantiene la exigencia de `is_on_biz_app=true` y `platform_type=CLOUD_API`, y no llama a registro, migración o eliminación del número.

Documentación oficial revisada: [implementación](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation), [v4](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4), [Coexistencia](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/).

## Actualización comprobada el 4 de noviembre de 2026

- Railway `d870832a-a9b7-452c-9f34-38673affd7df`: SUCCESS y `/health` HTTP 200 con PostgreSQL. El intercambio OAuth admite la ruta autorizada del SaaS y el puente público del SDK oficial, exclusivamente tras un rechazo explícito 100/36008; no reintenta timeouts ni códigos consumidos. Las 12 pruebas de onboarding del último ajuste pasaron. La comprobación real posterior sigue fallando, ahora con referencia de Meta 191: no acreditar una conexión exitosa.
- La URL `https://reservas-saas-ae.vercel.app/dashboard/whatsapp` fue añadida con autorización expresa a OAuth; el validador de Meta la mostró válida. HTTPS y coincidencia estricta permanecen activos.
- Vercel `dpl_9AAUu3gkhZReo1JuTgyQ7NddjFFb`: READY en el alias original. La configuración de WhatsApp exige propietario autenticado y permanece accesible cuando vence la suscripción. La automatización se oculta en esa situación. Se comprobó en producción que WhatsApp abre y que Calendario continúa redirigiendo a Suscripción. No se cambió el plan, su vencimiento ni la aprobación de TRIAL.
- Con autorización expresa se activaron `history`, `smb_app_state_sync` y `smb_message_echoes` en v26.0; se observaron los tres interruptores en estado suscrito. `messages` y `account_update` ya estaban activos y se conservaron.
- Meta advierte que una app sin publicar solo recibe eventos de prueba del panel, no datos de producción, incluso de administradores y desarrolladores.
- Publicar continúa deshabilitado: el portfolio figura No verificado y la verificación de acceso depende de completar la verificación comercial.
- Ningún número personal quedó conectado, no se realizó una migración y no se envió un recordatorio real.

## Bloqueos observados en Meta

- Verificación del negocio pendiente. El propietario confirmó que dispone de RIF vigente de persona natural emitido por SENIAT y facilitó su nombre legal exacto y correo de soporte. Se completó el nombre en un borrador de Meta; el siguiente paso solicita el domicilio del documento. No se enviaron documentos ni una solicitud definitiva. Meta decidirá si acepta esta vía. No declarar una empresa Codesc registrada ni otro país sin respaldo real.
- El icono de 1024 × 1024, las URLs de privacidad y eliminación y la categoría «Utilidad y productividad» están guardados en Meta. Se comprobó su persistencia al recargar; el aviso de esos campos obligatorios desapareció. Esto no publica ni aprueba la app.
- Siguen pendientes las respuestas de tratamiento de datos y las instrucciones para revisores.
- Faltan las demostraciones reales de envío y administración de plantillas. Las pruebas automatizadas con un proveedor simulado no sustituyen la grabación de un envío recibido en WhatsApp.
- Después de la revisión de la app debe completarse la verificación de acceso que Meta requiera al proveedor.

`icon-1024.png` reproduce el icono existente del sitio y cumple el tamaño solicitado. Se subió y guardó en Meta con autorización del propietario.

## Publicación comprobada

- Privacidad: https://reservas-saas-ae.vercel.app/privacidad
- Eliminación: https://reservas-saas-ae.vercel.app/eliminacion-de-datos
- Ambas páginas devolvieron HTTP 200 con su título y el correo de soporte autorizado.
- Vercel: `dpl_41iEFupmJKoBdNGfhQJPjgyw8Y96`, estado Ready y alias de producción original.
- Railway: `d3371160-702a-4041-8b0a-4a59f4b272df`, estado SUCCESS. `/health` devolvió HTTP 200, proveedor `meta-cloud` y base `postgres`.
- La conexión privada anterior falló al intercambiar la autorización. La nueva versión conserva únicamente la referencia numérica controlada de Meta para diagnosticar otro intento; no acredita una conexión exitosa.
- Pruebas afectadas: backend 42/42, SDK 4/4, typecheck, lint y compilación de Next correctos. No se ha ejecutado una prueba de carga ni una demostración real de los mensajes automáticos.

## Descripción propuesta de la aplicación

Reservas - Codesc es un SaaS para que negocios de servicios gestionen su calendario, clientes y mensajes relacionados con sus reservas. El propietario del espacio introduce una credencial de Meta autorizada para su cuenta de WhatsApp Business y un número dedicado a Cloud API. El servidor comprueba la app emisora de la credencial, los permisos, la relación entre cuenta y número y su estado antes de guardar la conexión. Los datos y credenciales permanecen separados por empresa. Este flujo no promete conservar el uso móvil de ese número.

## Justificación propuesta de permisos

### whatsapp_business_messaging

La aplicación envía una confirmación al crear una reserva autorizada y un recordatorio antes de su fecha, utilizando plantillas de utilidad aprobadas de la cuenta conectada. El destinatario debe haber aceptado los mensajes para esa reserva. Los botones de respuesta permiten confirmar, solicitar un cambio o cancelar. El servidor recibe mensajes y estados de entrega mediante un webhook firmado y actualiza la reserva de la empresa correspondiente. El uso exige autorización del propietario, acceso activo y cuota disponible.

### whatsapp_business_management

La aplicación comprueba la cuenta y el número indicados por el propietario autenticado mediante una credencial emitida por la app configurada en el servidor, suscribe la app a la cuenta autorizada y consulta el estado de sus plantillas. El propietario puede solicitar las plantillas de confirmación y recordatorio desde el panel. Este permiso permite comprobar si la cuenta y sus plantillas están listas para el flujo solicitado. No se utiliza para gestionar las cuentas de otras empresas sin su autorización. El acceso a activos de otro negocio sigue requiriendo el nivel de acceso que exija Meta; compartir el activo manualmente no sustituye la revisión de la app.

## Guion de demostración real pendiente

1. Mostrar la URL de producción y entrar con una cuenta de revisión preparada para ese fin, sin mostrar contraseñas, tokens, códigos ni datos reales de pacientes.
2. Mostrar la conexión directa autorizada de una cuenta habilitada por Meta y su número dedicado a Cloud API, sin exponer el token en la grabación. No usar una cuenta desactivada ni presentar el inicio de sesión de Facebook como una conexión completada.
3. Desde el panel, solicitar o mostrar las plantillas de utilidad y su estado real en Meta. No presentar una plantilla pendiente como aprobada.
4. Mostrar consentimiento del destinatario para una reserva ficticia de prueba, utilizando datos que las personas autoricen para esa demostración.
5. Crear una reserva y mostrar su confirmación recibida en un teléfono distinto del emisor, con la automatización activa y los requisitos comerciales cumplidos.
6. Mostrar una respuesta de botón y su reflejo en el calendario; mostrar el recordatorio programado y, cuando corresponda, su recepción real.
7. Explicar cómo desconectar la integración y dónde solicitar la eliminación de datos mediante un proceso que ya esté operativo.

## Información que debe confirmar el propietario

- Identidad legal y documentación aceptable para Meta, con país y domicilio reales.
- Correo de soporte que puede publicarse en el sitio y atender solicitudes de privacidad/eliminación.
- Responsable y procedimiento efectivo de eliminación, conservación y atención de derechos. No afirmar una eliminación automática de cuentas que todavía no esté implementada.
- Proveedores con acceso a datos: Supabase, Railway, Vercel y Meta; Cal.com solo si el negocio activa esa integración. Las afirmaciones sobre transferencias, contratos, solicitudes de autoridades y prácticas internas deben corresponder a la situación real.
- Aprobación de los textos legales antes de publicarlos y de la solicitud completa antes de enviarla a Meta.

## Prueba privada y lanzamiento público

`META_SIGNUP_ENABLED` permanece en `false` y `META_SIGNUP_TEST_COMPANY_IDS` está vacío. La interfaz activa usa conexión directa. El acceso público de clientes a activos de Meta no está aprobado por el hecho de disponer de ese formulario. La verificación comercial, el acceso avanzado, la aprobación de TRIAL, las plantillas y la facturación se comprueban por separado. [Permisos oficiales de WhatsApp](https://developers.facebook.com/documentation/business-messaging/whatsapp/permissions/).

### Límites observados en la cuenta el 3 de noviembre de 2026

- WhatsApp Manager → Información de socios mostró **0 de 10 clientes registrados esta semana**. Es un límite de incorporación en una ventana móvil de siete días, no diez negocios activos garantizados ni aprobación de uso comercial.
- WhatsApp Manager → Límites de mensajes mostró **250** como nivel actual del portfolio, con la cuenta seleccionada **Test Messaging Account**. Aún no aparece un emisor personal conectado al SaaS.
- La documentación define ese límite por destinatarios únicos fuera de la ventana de atención en 24 horas continuas, compartido entre números del portfolio. No equivale a 250 mensajes diarios, ni a una cuota mensual, ni a 250 empresas clientes.
- El administrador de registro insertado sigue indicando que no se pueden incorporar usuarios hasta completar la verificación comercial y que producción exige revisión de la app y verificación de acceso. La documentación de Embedded Signup exige acceso avanzado aprobado para los permisos requeridos. El cupo de diez no levanta estos requisitos.
- El nuevo intento privado desde el SaaS quedó esperando a Meta sin abrir una ventana de autorización observable. Se canceló y se dejó un nuevo intento preparado para que el propietario pulse «Continuar con Meta». La página alojada de coexistencia abrió, pero no avanzó ni mostró portfolios seleccionables. No se completó la autorización, no se solicitó un OTP y no se vinculó ningún número.

Referencias: [límites de registro y revisión de apps](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/#limitations), [límites de mensajes](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits), [versiones](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/versions).
