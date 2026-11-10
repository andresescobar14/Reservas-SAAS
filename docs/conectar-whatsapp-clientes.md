# Conectar WhatsApp a Reservas - Codesc

Guía actualizada el 9 de noviembre de 2026. El flujo activo utiliza **conexión directa a WhatsApp Cloud API** con un número dedicado. Embedded Signup, Coexistencia y Make están desactivados. No hace falta registrar ese número en una aplicación móvil para este flujo.

## Estado del piloto

La cuenta de mensajes «Andres's Prueba» volvió a mostrar **Estado de la cuenta: Aprobada** después de la revisión solicitada. El portfolio sigue **No verificado**. La pantalla de facturación de Meta confirma un método de pago asociado a esta cuenta de mensajes. Todavía falta comprobar un envío real.

La app **Reservas Codesc** (`1451308149826134`) está **publicada**, con autorización del propietario. Pertenece al mismo portfolio que administra el emisor. El usuario del sistema **Reservas Codesc Automatizaciones** tiene acceso parcial a esa app, a las plantillas y al envío de mensajes del número dedicado. Su token de 60 días está guardado cifrado y vence el **8 de enero de 2027**; renovar antes del vencimiento. La clave de la app está configurada privadamente en Railway y el despliegue `85e183cb-a3da-423a-a6fc-169b845e42eb` terminó en SUCCESS.

El número dedicado **+58 422-0604553** quedó validado y conectado desde el panel real de Ejemplo-reservas. Graph API confirma acceso a la cuenta `1776422760311269`, al teléfono `1483697451489898` y estado Cloud API conectado. La credencial está cifrada en la base de datos. El callback de Railway está verificado, `messages` está suscrito y los registros HTTP confirman que Meta recibió **200** al enviar su evento de prueba. Esto comprueba la recepción del webhook; todavía no prueba la entrega de un recordatorio al teléfono del destinatario.

El propietario autorizó un piloto interno gratuito de **7 días y 35 mensajes totales**, aprobado manualmente para Ejemplo-reservas hasta el **16 de noviembre de 2026 a las 17:45, America/Caracas**. No se registró un pago ni se borraron consumos. Ambas plantillas continúan **PENDING** y la automatización permanece **apagada**, con cero trabajos y cero consumo. Falta su aprobación por Meta para habilitar la automatización y realizar la prueba real de confirmación y recordatorio. No se acredita aún una conexión lista para vender a otros negocios.

Una página que funciona, un servidor saludable o un teléfono que Meta muestra como «Conectado» no acreditan que la app pueda enviar. La recuperación de la cuenta y los requisitos de la app deben resolverse antes del piloto. No crear cuentas nuevas para eludir una desactivación.

El emisor 4553 utiliza conexión directa dedicada: **no registrarlo ahora en WhatsApp ni WhatsApp Business del móvil**. El número personal terminado en 6146 permanece separado. No se activó Coexistencia. La [revisión de plantillas de Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-review/) indica que la decisión puede tardar hasta 24 horas; no garantiza aprobación. No duplicar ni reenviar las plantillas mientras sigan pendientes.

## Preparación en Meta

1. El negocio debe administrar su portfolio con información real y una cuenta de WhatsApp habilitada. Si aparece una restricción, revisarla en [Ayuda para empresas](https://business.facebook.com/business-support-home/) antes de continuar.
2. Agregar un número dedicado a Cloud API que pueda recibir el código de SMS o llamada y completar el registro en Meta. No eliminar, migrar ni registrar el WhatsApp personal del propietario como parte de este proceso.
3. Configurar la facturación y el método de pago que Meta solicite. Los cargos de Meta son independientes del plan de Reservas. No se ha contratado una línea de crédito que permita a Reservas pagar automáticamente las cuentas de los clientes.
4. Preparar una credencial de usuario del sistema, emitida por la misma app configurada en el servidor, con `whatsapp_business_management` y `whatsapp_business_messaging`, y acceso a la cuenta y al número. Los identificadores WABA y Phone Number ID son diferentes del número visible. Un identificador de presencia de WhatsApp tampoco sustituye el de la cuenta de mensajes.
5. Para que la app de Reservas acceda a datos de otros negocios, completar la revisión y el acceso avanzado que exige Meta. Una asignación manual de socio no sustituye esa aprobación. El token válido por sí solo tampoco acredita acceso al activo.

Esta versión no ofrece conectar cualquier número de un cliente únicamente iniciando sesión en Facebook. El alta directa necesita que la credencial y los activos hayan sido autorizados en Meta. No se promete que el mismo número continúe funcionando en el móvil.

## Conexión desde el SaaS

1. Entrar como propietario en **WhatsApp** y pulsar **Introducir credenciales de Meta**.
2. Introducir el ID de cuenta de WhatsApp Business, el Phone Number ID y el token en el campo privado. No compartir tokens, contraseñas ni códigos por chat o correo.
3. Pulsar **Validar y conectar número**. El servidor verifica token, app, permisos, relación entre cuenta y número, registro en Cloud API y suscripción al webhook. Solo entonces cifra y guarda la credencial de la empresa.
4. Solicitar o consultar las plantillas **reserva_confirmacion** y **recordatorio_cita**, idioma **es_MX**, categoría **UTILITY**, con nombre, fecha y hora. Las versiones nuevas incluyen **Confirmar**, **Cambiar cita** y **Cancelar**. Usar **Actualizar desde Meta** para consultar el estado; no tratar «En revisión» como aprobado.
5. Con cuenta habilitada, ambas plantillas aprobadas, acceso de WhatsApp autorizado, cuota disponible y plan vigente, activar la automatización. Un TRIAL vencido o sin aprobación administrativa mantiene el envío bloqueado.
6. Crear una reserva futura de prueba con un destinatario que haya aceptado recibir sus mensajes. Verificar la recepción de la confirmación, el registro de su respuesta y la recepción del recordatorio. El estado aceptado por Meta no equivale a entregado.

Las credenciales están separadas y cifradas por empresa. Renovar los tokens antes de su vencimiento y validar la nueva credencial; no borrar cuotas ni reintentar envíos inciertos para forzar una prueba.

## Automatización y límites

El flujo base envía **dos mensajes automáticos por reserva**: confirmación al crearla y un recordatorio previo. Cada mensaje consume una unidad de la cuota del SaaS. Una reprogramación puede producir una nueva confirmación y cancela los trabajos anteriores. El consentimiento se registra por reserva; disponer del teléfono no equivale a autorización.

El calendario de Reservas funciona sin herramientas externas. Cal.com es opcional y se conecta por webhook firmado; las respuestas de WhatsApp modifican Reservas, sin prometer escritura de vuelta en Cal.com. Consulta [la guía completa de operación](whatsapp-sin-make.md).

Las cuotas actuales del motor son TRIAL de siete días y 35 mensajes totales, sujeto a aprobación manual; PRO de 1.000 mensajes al mes; PREMIUM de 2.500. No acreditan que Meta habilite la cuenta ni garantizan entrega. Los precios comerciales quedan pendientes de revisión por el propietario.

La pantalla del número mostró anteriormente **250 clientes/24 h**. No equivale a 250 mensajes diarios, una cuota mensual o 250 empresas clientes; tampoco prevalece sobre una desactivación. Consultar el nivel vigente en Meta después de resolver la restricción.

## Referencias

- [Permisos y acceso a datos de otros negocios](https://developers.facebook.com/documentation/business-messaging/whatsapp/permissions/)
- [Límites de mensajes](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits)
- [Revisión de plantillas](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-review/)
- [Tarifas oficiales](https://business.whatsapp.com/products/platform-pricing)
