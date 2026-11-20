# Bandeja de mensajes

La página privada `/dashboard/mensajes` utiliza Meta Cloud API. Cada empresa ve únicamente las conversaciones recibidas por su número conectado y sus mensajes salientes. El número se resuelve desde los metadatos del webhook firmado; el navegador no elige el remitente ni puede acceder a las tablas privadas de otra empresa.

## Despliegue

Aplicar `whatsapp-cloud-api/chat.sql` como administrador después de las migraciones existentes. Concede al rol limitado `reserva_whatsapp` lectura, inserción y actualización en dos tablas privadas con RLS, sin permisos de borrado, planes o pagos. El texto, nombre y teléfono se guardan cifrados mediante AES-256-GCM. No registrar cuerpos de mensajes ni credenciales en logs. Publicar `server.js`, `native-automation.js`, `chat.js` y `quiet-hours.js` en Railway; la salud comprueba que exista el almacenamiento.

## Recepción y respuesta

- El webhook guarda el nuevo mensaje antes de confirmar recepción a Meta. Los identificadores de Meta deduplican reintentos. También se conserva el procesamiento anterior de botones de reservas.
- Se recibe texto y el título de respuestas interactivas. Otros tipos muestran un marcador; esta versión no descarga imágenes, audios o documentos.
- Las respuestas manuales requieren empresa activa, número conectado, credencial vigente y un mensaje entrante dentro de las últimas 24 horas. Se comprueba en el servidor incluso si el navegador manipula su reloj.
- Un envío reserva su identificador antes de contactar a Meta. La clave de idempotencia impide repetirlo. Si el resultado es incierto, no se reenvía automáticamente ni se permite abrir otro intento del chat hasta conciliarlo.
- Aceptado, entregado y leído son estados distintos; los recibos firmados actualizan el mensaje sin retroceder desde leído a enviado. Los recibos adelantados se concilian desde la cola durable.
- Las respuestas manuales se registran en la conversación; la cuota existente de mensajes automáticos se mantiene para plantillas/recordatorios. No se cambia la tarifa de ningún plan. Las tarifas y restricciones de Meta siguen aplicándose.
- Fuera de la ventana, la bandeja desactiva texto libre. El envío de una plantilla de cita requiere aprobación, una próxima reserva y la autorización específica de esa reserva; usa el mismo motor y cuota de la automatización. Una plantilla saliente no abre por sí sola la ventana.

Las conversaciones y mensajes se cargan de 50 en 50. La búsqueda filtra las conversaciones cargadas; «Cargar más» permite ampliar esa lista. La página consulta cambios cada 10–15 segundos mientras permanece visible. No es una importación del historial del teléfono. «Ver ejemplo» es una simulación local separada de los datos reales y no envía WhatsApps.

## Consentimiento y horarios

La casilla de autorización al crear una reserva sigue desmarcada por defecto. El formulario para recepción incluye el aviso que debe comunicarse al cliente sobre confirmación y recordatorio; el servidor registra su autorización para esa reserva. Recibir una consulta en el chat no autoriza recordatorios de otras reservas.

Los recordatorios automáticos se despachan entre 08:00 y 20:00, en la zona de la empresa. Un trabajo nocturno se aplaza hasta las 08:00 y se omite si la cita ya habrá empezado. Las confirmaciones por una nueva reserva mantienen su envío inmediato cuando se cumplen los requisitos. Esta protección también aplica a trabajos creados antes del despliegue, porque se verifica al despachar.

## Límites de esta entrega

No activa automáticamente las automatizaciones pendientes ni concede a la app permisos de Meta para negocios externos. Cada número debe estar registrado y autorizado en Meta. La recepción real y las respuestas manuales dentro de la ventana no requieren que las plantillas de recordatorio estén aprobadas. Las plantillas pendientes permanecen bloqueadas.
