# Arquitectura y Planificación del SaaS: Automatizador de Reservas y WhatsApp

## 1. Descripción del Proyecto
SaaS B2B multi-nicho diseñado para cualquier empresa, local o profesional independiente que opere mediante reservaciones de clientes (clínicas, spas, barberías, talleres, consultorías, canchas deportivas, etc.). Permite gestionar una agenda visual y automatiza el envío de recordatorios por WhatsApp 24 horas antes de la cita, utilizando el propio número del negocio (mediante conexión QR). 

## 2. Stack Tecnológico
- **Frontend & Backend:** Next.js (App Router).
- **Base de Datos & Autenticación:** Supabase (PostgreSQL).
- **Estilos y UI:** Tailwind CSS, Shadcn UI (Componentes limpios y modernos), AOS (Animate On Scroll) / GSAP para animaciones fluidas en la Landing Page.
- **Servicio de WhatsApp:** Evolution API o librería `whatsapp-web.js` (alojado en un entorno persistente como Railway/Render, separado de Vercel).
- **Sincronización externa:** API / Webhooks para Google Calendar.

## 3. Arquitectura Multi-Tenant (Aislamiento de datos)
- Cada cliente/negocio representa un `tenant_id` o `company_id`.
- Las tablas en Supabase DEBEN tener RLS (Row Level Security) activado para que un negocio jamás pueda ver los clientes o citas de otro negocio.
- **Gestión de Suscripción:** Tabla `companies` con columnas `trial_ends_at` (14 días desde el registro) y `subscription_status` ('trial', 'active', 'past_due'). Si expira, se bloquea el acceso al Dashboard y se muestra la pantalla de pago.

## 4. Módulos Principales del Dashboard Privado
1. **Calendario / Agenda:** Vista semanal y mensual (FullCalendar o react-big-calendar). Click para abrir modal y registrar la reserva (Nombre del Cliente, WhatsApp, Servicio/Motivo, Fecha y Hora).
2. **Directorio de Clientes:** Tabla CRM básica donde la empresa puede ver el historial de las personas que han agendado.
3. **Conexión WhatsApp:** Pantalla dedicada que genera un Código QR en tiempo real para enlazar el teléfono del local. Muestra el estado ("Conectado" / "Desconectado").
4. **Integraciones:** Sección donde el usuario puede generar un Webhook URL o conectar su cuenta de Google Calendar para sincronización bidireccional si no desea usar el calendario nativo.

## 5. Reglas de Diseño y Experiencia de Usuario (UX)
- Interfaz neutral, minimalista y corporativa (modo claro por defecto, estilo Vercel/Linear), que no parezca exclusiva de un nicho médico, sino adaptable a cualquier industria.
- Cero recargas de página innecesarias (usar estados de React de forma eficiente).
- Uso de `Toasters` (notificaciones flotantes) para confirmar acciones (ej. "Reserva guardada con éxito").