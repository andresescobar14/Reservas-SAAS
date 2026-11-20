# Propuesta: reservas de clientes desde una página pública

Recomendación para el siguiente módulo: un enlace por negocio, por ejemplo `/reservar/estudio-bienestar`, compartible por WhatsApp, Instagram, su sitio y un QR en recepción. Es una propuesta; la página pública todavía no está implementada.

## Flujo para el cliente

1. Ve el nombre y logo del negocio y elige un servicio y, cuando corresponda, profesional.
2. Elige entre horarios realmente disponibles. Se muestra la zona horaria del negocio.
3. Introduce nombre y teléfono. La aceptación de WhatsApp es opcional, explícita y sin premarcar: «Acepto recibir de [negocio] una confirmación y un recordatorio de esta reserva por WhatsApp».
4. Confirma la reserva y recibe un comprobante en pantalla. Si autorizó WhatsApp y el negocio tiene número, plantillas y automatización activos, se programan los mensajes.
5. La reserva aparece directamente en el calendario del negocio. Confirmar, solicitar cambio o cancelar sigue el flujo de WhatsApp existente.

## Requisitos de una primera versión

- El negocio configura servicios, duración, horario semanal, descansos, vacaciones y anticipación mínima.
- La consulta pública expone disponibilidad y datos públicos del negocio, nunca nombres, teléfonos o agenda privada de otros clientes.
- La creación ocurre en una transacción con comprobación de disponibilidad y protección contra solapamientos. Dos personas no pueden reservar el mismo recurso y horario simultáneamente.
- El servidor resuelve el negocio a partir de su enlace público; no confía en `company_id`, duración o precios enviados por el navegador.
- Se guardan el texto/versionado del consentimiento, fecha y origen, y se aplican límites contra abuso e idempotencia.
- Los cambios y cancelaciones usan enlaces firmados con caducidad y no exponen identificadores sin protección.

## Alternativas

| Opción | Uso recomendado | Consideración |
| --- | --- | --- |
| Página propia por negocio | Experiencia integrada dentro de Reservas - Codesc | Requiere desarrollar disponibilidad pública y reserva atómica |
| Cal.com conectado al motor existente | Empezar usando una agenda pública que el negocio ya tiene | Configurar servicios/horarios y consentimiento en Cal.com; los cambios se gestionan allí |
| Widget de la página propia | Negocios que ya tienen sitio | Reutiliza el mismo motor de reservas, incrustado en su web |

Primero conviene la página propia sencilla; pagos anticipados, profesionales múltiples y listas de espera pueden incorporarse después según la necesidad del negocio.
