# Decisiones y puntos de extensión

## Tenancy y suscripciones

El MVP relaciona `auth.users.id` con `companies.owner_id` (único). Un usuario propietario administra una empresa. Para equipos, añadir una tabla `company_members` con roles y sustituir la comprobación de propietario por pertenencia en `has_company_access` y `requireCompany`.

`requireCompany` valida la sesión con `getUser`, carga la empresa y permite mostrar facturación. `requireActiveCompany` añade el control de prueba y suscripción. Las páginas privadas y cada Server Action aplican esta comprobación; RLS vuelve a comprobarla en PostgreSQL. El layout no constituye la única barrera de acceso.

Las columnas de suscripción y propiedad carecen de permisos de escritura para `authenticated`. Un webhook de pagos validado deberá usar credenciales del backend y asociar cada pago con su empresa de forma verificable. Nunca aceptar cambios de plan desde metadatos enviados por el usuario.

## Registro y verificación opcional

El registro directo requiere el proveedor Email activo y Confirm email desactivado. El servidor consulta los ajustes públicos de Auth antes de crear una cuenta para detectar una configuración incompatible sin consumir la cuota de correos. El registro utiliza un cliente aislado con flujo implicit, compatible con autoconfirmación, y transfiere la sesión resultante al cliente SSR para escribir sus cookies.

Mi cuenta permite solicitar un OTP para el correo del usuario autenticado con `shouldCreateUser: false`. La plantilla Magic Link debe incluir `{{ .Token }}`. La solicitud no sustituye la sesión actual; al comprobar el código se exige que el usuario y el correo devueltos coincidan antes de renovar sus cookies.

La comprobación opcional se representa durante 30 días en una cookie firmada HttpOnly vinculada a esa identidad. Es un estado por navegador, no un permiso ni una verificación global almacenada en PostgreSQL. No condiciona el registro, las reservas, RLS o la suscripción. La clave de firma solo existe en el servidor. El envío requiere un servicio SMTP operativo y conserva los límites de Supabase.

## Reservas y recordatorios

`book_reservation` crea o actualiza al cliente por `(company_id, phone)` y crea la cita en la misma transacción. Una reserva inválida revierte también el cambio del cliente. No impide citas simultáneas: el documento inicial no define recursos, profesionales ni capacidad. Añadir estos conceptos antes de imponer una restricción de solapamiento.

El worker de recordatorios se desplegará en un proceso persistente separado. Debe reclamar trabajos de forma atómica, comprobar una suscripción vigente y una sesión de WhatsApp vinculada a la misma empresa, excluir citas canceladas/completadas o que ya pasaron, gestionar reintentos y deduplicar envíos. No basta un temporizador dentro de una función de Vercel. Para varias réplicas, añadir una cola/outbox con estados, bloqueo y claves de idempotencia; las dos columnas actuales son el punto de partida, no una cola de producción.

El registro de `reminder_sent_at` solo corresponde al backend. Reservas creadas con menos de 24 horas de antelación tendrán una fecha de recordatorio ya vencida; el worker debe definir si envía inmediatamente según la política comercial que se elija.

## Interfaz y datos

La demo pública utiliza exclusivamente estado de React y datos ficticios. No cambia las comprobaciones de las rutas privadas y no existe un interruptor de autenticación de demo.

Las páginas reales leen datos con un cliente Supabase asociado a las cookies del usuario. Las mutaciones validan la entrada con Zod y actualizan las rutas con `revalidatePath`, sin recargas completas. El guardado de reservas utiliza una llamada RPC transaccional.

La carga inicial del calendario/directorio está pensada para el arranque del producto. Al aumentar el volumen, consultar solo el intervalo visible del calendario y paginar el directorio y el historial desde el servidor.

La UI usa una zona horaria IANA por empresa. Supabase valida la zona recibida al crear la empresa y usa UTC como alternativa. La base guarda instantes con zona horaria; el frontend presenta y convierte los campos locales con Luxon.

## Servicios externos

- WhatsApp: almacenar sesiones/tokens solo en backend, vincular una instancia por `company_id` y ofrecer endpoints autenticados para generar QR y consultar el estado real.
- Google Calendar: implementar OAuth, renovación de tokens, mapas entre IDs de eventos y reservas, reconciliación y prevención de bucles de sincronización.
- Webhooks: crear secretos por empresa, firmar cargas, registrar entregas y aplicar reintentos. No se publican URLs ni tokens simulados en esta base.
