# Reservas públicas del propietario

El botón «Reservar ahora» de la portada enlaza `/reservar/reservas-codesc`. Una sola página dinámica sirve la configuración del negocio identificado por su enlace. El servidor determina la empresa, el remitente y el servicio.

El piloto ofrece «Demostración de Reservas», de 30 minutos, en America/Caracas. Por solicitud del propietario acepta cualquier día y hora disponible, con un minuto mínimo de anticipación y hasta 30 días. La duración no es el tiempo de espera para la confirmación. La regla de recordatorios de 08:00 a 20:00 permanece vigente; para citas cercanas se programa a mitad del tiempo disponible y si faltan menos de diez minutos se omite.

## Despliegue

1. Aplicar `whatsapp-cloud-api/public-booking.sql` como administrador, tras `native-automation.sql`.
2. Configurar una fila en `whatsapp_cloud.booking_pages` para la empresa interna. La configuración empieza desactivada y solo un administrador puede publicarla. El runtime tiene lectura de configuración y ejecución de una función concreta; no puede habilitar otros negocios ni cambiar planes.
3. Publicar `public-booking.js` y `server.js` en Railway, con el Dockerfile actualizado. No se añaden claves, credenciales públicas ni permisos de lectura de clientes para visitantes.
4. Verificar las plantillas y conexión del propietario y activar la automatización existente. Publicar Next.js en el proyecto original `reservas-saas-ae` de Vercel.

## Datos y envíos

GET `/api/public-booking/:slug` devuelve solo nombre público, servicio, zona, fechas y horas disponibles. POST valida una prueba firmada de 30 minutos de vigencia, nombre, teléfono internacional, fecha futura y un consentimiento booleano sin premarcar. La función SQL vuelve a validar horario, acceso y disponibilidad. Crea cliente si no existe, reserva y evidencia en una transacción. No permite renombrar a un cliente existente desde el formulario público.

Los triggers programan los trabajos en la cola actual; no se envían mensajes desde el navegador. Una misma solicitud es idempotente. Un bloqueo por empresa y un trigger sobre las reservas impiden solapamientos también frente a altas y reprogramaciones de la agenda interna cuando esa empresa tiene una página pública activa. Cancelar libera disponibilidad.

La pantalla distingue reserva guardada, confirmación programada y recordatorio programado. Programado no significa entregado. Los botones existentes de WhatsApp continúan confirmando, cancelando o solicitando cambios; no se crean enlaces de administración anónimos.

## Límites del piloto

El formulario admite 50 reservas públicas por empresa en 24 horas y tres por teléfono en ese mismo intervalo, independientemente del acceso ilimitado del propietario. Hay además límites de solicitudes por proceso y un campo trampa. Son controles iniciales, no una protección contra ataques distribuidos; para abrir este flujo a muchos negocios conviene incorporar verificación contra bots y un límite distribuido por origen.

Esta entrega no incluye una pantalla para que otros propietarios configuren sus páginas, catálogo de servicios múltiples, pagos, profesionales ni enlaces públicos de cancelación. El esquema conserva la separación por empresa para extender el módulo posteriormente.
