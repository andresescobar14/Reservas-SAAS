# Plantillas de WhatsApp aprobadas

Consultadas directamente en Meta el 9 de noviembre de 2026. Ambas están **APPROVED**, en español de México (`es_MX`), categoría **UTILITY**.

## Confirmación al reservar — `reserva_confirmacion`

> Hola {{1}}, tu cita quedó agendada para el {{2}} a las {{3}}. Puedes confirmar, solicitar un cambio o cancelar con los botones.

Botones de respuesta rápida: **Confirmar**, **Cambiar cita**, **Cancelar**.

Ejemplo:

> Hola Andrés, tu cita quedó agendada para el 2026-11-10 a las 11:30. Puedes confirmar, solicitar un cambio o cancelar con los botones.

## Recordatorio previo — `recordatorio_cita`

> Hola {{1}}, te recordamos tu cita del {{2}} a las {{3}}. Puedes confirmar, solicitar un cambio o cancelar con los botones.

Botones de respuesta rápida: **Confirmar**, **Cambiar cita**, **Cancelar**.

Ejemplo:

> Hola Andrés, te recordamos tu cita del 2026-11-10 a las 11:30. Puedes confirmar, solicitar un cambio o cancelar con los botones.

## Datos que completa el sistema

| Variable | Dato |
| --- | --- |
| `{{1}}` | Nombre del cliente |
| `{{2}}` | Fecha de la reserva en la zona horaria del negocio |
| `{{3}}` | Hora de la reserva en la zona horaria del negocio |

La configuración del piloto utiliza una confirmación al reservar y un recordatorio 24 horas antes. Para reservas creadas con menor anticipación, el segundo mensaje se programa a mitad del tiempo disponible; si faltan menos de diez minutos, se omite.

**Confirmar** registra la asistencia confirmada. **Cambiar cita** registra la solicitud de cambio y detiene el recordatorio pendiente: el negocio debe acordar y guardar la nueva fecha. **Cancelar** cancela la reserva y sus mensajes pendientes.

Modificar el texto aprobado requiere gestionar su revisión en Meta. Los mensajes solo se programan para reservas con autorización del destinatario y con acceso, plan y cuota vigentes.
