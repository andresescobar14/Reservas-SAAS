# Reserva

Base local de un SaaS B2B para gestionar reservas y clientes, construida según `planificacion.md`.

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui (Radix), Lucide, Supabase Auth/PostgreSQL, FullCalendar, Luxon, Sonner y Framer Motion. El archivo `package-lock.json` fija las versiones instaladas. La CLI actual de shadcn es `shadcn`, sucesora de `shadcn-ui`.

## Interfaz y precios

La aplicación arranca en **modo oscuro** y ofrece un botón (sol/luna) para cambiar a modo claro; la elección se guarda en `localStorage` (`reserva-theme`). El verde es el color principal en botones, enlaces, focus e iconos. La portada adapta la composición de Reflect Notes a superficies blancas, navegación flotante y tarjetas con brillo interior. La sección `/#precios` sigue las dos columnas de la referencia de Unicorn Studio: prueba de **14 días gratis** y **Reserva Pro por $499 MXN al mes**.

Los precios se editan en `lib/pricing.ts` y se reutilizan en `/suscripcion`. Los pagos reales requieren conectar el checkout y su webhook; mostrar un precio no activa cobros. El motor local de WhatsApp ya permite conexión por QR y envío desde una sesión por empresa; la programación automática de recordatorios y Google Calendar siguen pendientes.

La tipografía Inter se sirve localmente. Los párrafos principales tienen 16–20 px y los H2 de la landing, 36–48 px. Consulta `docs/design-system.md` para los tokens y la adaptación de las referencias.

## Arranque local

Requiere Node.js 20.9 o posterior y npm. Las dependencias ya están instaladas en este entorno.

```bash
npm install
npm run dev
```

Abre http://localhost:3000. La landing, Login/Register y la demo funcionan sin configurar servicios externos. En `/demo` puedes crear reservas, buscar clientes, consultar historiales y cambiar estados; sus datos son de ejemplo y se guardan solo en memoria hasta recargar.

## Publicación en Vercel

Producción: **https://reservas-saas-gray.vercel.app**. El proyecto `reservas-saas` está vinculado al espacio `andres-c5d1` mediante `.vercel/project.json`, que permanece fuera de Git.

`vercel.json` configura Next.js, `npm ci` y `npm run build`. `.vercelignore` excluye archivos de entorno, herramientas locales, documentación, pruebas y SQL de la subida. Las variables públicas de Supabase y el dominio se configuran en Vercel para Production. `EMAIL_VERIFICATION_SECRET` es una clave privada de producción independiente de la local, almacenada como Secret.

En Supabase, **Authentication > URL Configuration**, configura el Site URL como `https://reservas-saas-gray.vercel.app` y añade `https://reservas-saas-gray.vercel.app/auth/callback` a las Redirect URLs. Conserva también el callback local para desarrollo. Este ajuste remoto debe realizarlo el administrador del proyecto Supabase; no se modifica al publicar Next.js.

Para publicar los siguientes cambios desde esta carpeta:

```bash
npx --yes vercel@latest deploy --prod --yes --scope andres-c5d1
```

La aplicación sigue usando el proyecto Supabase existente. No es necesario volver a ejecutar la migración SQL para desplegar el frontend. Los pagos, WhatsApp y Google Calendar requieren sus integraciones independientes.

## Conectar Supabase

1. Crea un proyecto de Supabase y ejecuta **una sola vez** el contenido completo de `supabase-schema.sql` en **SQL Editor**, antes de registrar usuarios. El script es una migración inicial para una base nueva.
2. Crea `.env.local` a partir del ejemplo:

   PowerShell:

   ```powershell
   Copy-Item .env.example .env.local
   ```

   Bash:

   ```bash
   cp .env.example .env.local
   ```

3. Completa `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` con los valores del proyecto. `NEXT_PUBLIC_SITE_URL` es el origen del frontend, sin barra final. Usa `http://localhost:3000` en desarrollo.
4. En **Authentication > URL Configuration**, configura el Site URL y añade `http://localhost:3000/auth/callback` a las Redirect URLs permitidas. Añade el equivalente de producción al desplegar. Si usas `127.0.0.1`, configura también ese origen y su callback.
5. En **Authentication > Sign In / Providers > Email**, deja habilitado el proveedor Email y desactiva **Confirm email**. Guarda el cambio. Esto permite crear la cuenta e iniciar sesión sin depender del envío de un correo.
6. Reinicia `npm run dev` y registra tu negocio en `/register`. Entrarás directamente al calendario. La verificación por código se solicita después, desde **Mi cuenta**, y es opcional.

El trigger de Auth crea la empresa y su prueba de 14 días en la misma transacción. Esta primera versión asigna un propietario por empresa. Si ya había usuarios antes de ejecutar la migración, necesitarás una migración de incorporación para sus empresas; este script no modifica usuarios existentes.

No uses una clave `service_role` ni una secret key en variables `NEXT_PUBLIC_*`. La aplicación usa la identidad del usuario y RLS para las operaciones normales.

### Código opcional por correo

El registro usa correo y contraseña con **Confirm email desactivado en Supabase**. La aplicación comprueba ese ajuste público antes de crear la cuenta para evitar que el límite de correos vuelva a bloquear los registros. Cambiar el código del frontend o `.env.local` por sí solo no cambia el ajuste del proyecto remoto.

Para activar el complemento:

1. En **Authentication > Email Templates > Magic Link**, copia el contenido de `supabase-email-code-template.html` y guarda. La variable `{{ .Token }}` envía el código numérico. Conserva la longitud predeterminada de 6 dígitos del OTP.
2. La clave privada `EMAIL_VERIFICATION_SECRET` ya se generó en `.env.local` sin mostrarla. Reinicia el servidor local. Al desplegar, configura una clave privada de al menos 32 caracteres en las variables del servidor; debe ser estable entre despliegues y no llevar el prefijo `NEXT_PUBLIC_`.
3. Dentro del dashboard, abre **Mi cuenta > Enviar código a mi correo**, introduce el código recibido y pulsa **Comprobar**. También puedes volver a la agenda sin verificar. El envío solo ocurre al pulsar el botón; nunca se solicita automáticamente al registrarse.

Supabase genera y verifica el código de un solo uso. La aplicación toma la dirección de la sesión autenticada y no acepta un destinatario enviado por el navegador. El OTP se valida en un cliente aislado; solo se renueva la sesión después de comprobar que sigue perteneciendo al mismo usuario y correo. No se guardan códigos ni tokens en logs.

El estado «Verificado en este navegador» se conserva 30 días en una cookie firmada, `HttpOnly` y vinculada al usuario y al correo. No es una verificación global persistida en la base de datos y nunca concede permisos ni cambia RLS o la suscripción. Borrar cookies, cambiar el correo o rotar la clave reinicia ese estado opcional.

El servicio de correo predeterminado de Supabase solo permite enviar a miembros del equipo del proyecto y tiene una cuota reducida: actualmente 2 correos por hora **por proyecto**. El error `over_email_send_rate_limit` indica que se agotó esa cuota; cambiar de destinatario no la restablece. Espera a que se renueve antes de hacer otro intento. Si ya confirmaste una cuenta, usa `/login` en lugar de volver a registrarla.

Para enviar códigos a clientes reales, configura un proveedor **Custom SMTP** en Supabase Auth. Las credenciales SMTP se guardan en Supabase; no van en `.env.local` ni en el navegador. Si falla el envío, la cuenta permanece disponible. Consulta las [instrucciones oficiales de SMTP](https://supabase.com/docs/guides/auth/auth-smtp) y de [códigos OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless).

La aplicación muestra un mensaje específico y una referencia para los errores conocidos de Auth. El registro del servidor conserva únicamente la referencia y el estado HTTP, sin correo, contraseña ni tokens. Si aparece una referencia desconocida, revisa los registros de autenticación de Supabase para el diagnóstico completo.

## Rutas

| Ruta                       | Uso                                                                 |
| -------------------------- | ------------------------------------------------------------------- |
| `/`                        | Landing pública con animaciones y navegación                        |
| `/login`, `/register`      | Autenticación con Supabase                                          |
| `/auth/callback`           | Confirmación e intercambio del código de sesión                     |
| `/dashboard/calendario`    | Agenda semanal/mensual, nueva reserva, detalle y estado             |
| `/dashboard/clientes`      | Directorio, búsqueda, alta e historial                              |
| `/dashboard/whatsapp`      | Conexión real por QR y estado de WhatsApp por empresa               |
| `/dashboard/integraciones` | Pantalla base de Google Calendar y webhooks                         |
| `/dashboard/cuenta`        | Verificación opcional del correo por código, sin bloquear el acceso |
| `/suscripcion`             | Estado de suscripción y acceso al checkout cuando esté configurado  |
| `/demo`                    | Demo pública aislada de Supabase                                    |

`(auth)` es un grupo de rutas: no forma parte de las URLs.

## Seguridad y reglas implementadas

- RLS activo en `companies`, `customers` y `reservations`, con permisos mínimos para cada rol.
- El servidor obtiene `company_id` desde el usuario autenticado. No confía en un identificador enviado por el formulario.
- Una clave foránea compuesta impide reservas con clientes de otra empresa.
- La prueba dura 14 días. Una prueba vencida o un estado `past_due` bloquea el dashboard y las operaciones de clientes/reservas en la propia base de datos. La empresa sigue siendo visible para su propietario en la pantalla de suscripción.
- El cliente no puede cambiar el propietario, ampliar la prueba, modificar la suscripción ni simular recordatorios enviados.
- Cliente y reserva se guardan en una única transacción con una función `SECURITY INVOKER`, manteniendo RLS.
- Las fechas se almacenan como `timestamptz`; la agenda y los formularios utilizan la zona horaria de la empresa, detectada al registrarse.
- Los recordatorios se calculan para 24 horas antes. Reprogramar la fecha reinicia `reminder_sent_at`.

## Motor de WhatsApp e integraciones pendientes

El microservicio independiente está en [`whatsapp-engine`](whatsapp-engine/README.md). Las dependencias y su configuración local ya están instaladas. Ejecuta `npm start` dentro de esa carpeta y abre `/dashboard/whatsapp` desde el frontend local para generar y escanear el QR. Valida el JWT de Supabase, la empresa y su suscripción antes de consultar o enviar. La demo pública conserva su vista de ejemplo sin conectar teléfonos reales.

- **WhatsApp:** conexión por QR, estados y envío implementados en el motor persistente del puerto 3001. Para producción, alojar ese motor con disco persistente y HTTPS; configurar `NEXT_PUBLIC_WHATSAPP_ENGINE_URL` en Next.js y el origen permitido en el motor. Aún falta el worker con reintentos e idempotencia para recordatorios automáticos. El esquema ya tiene `reminder_due_at` y `reminder_sent_at`.
- **Pagos:** integrar checkout y webhook firmado. Solo un backend autorizado debe actualizar `companies.subscription_status`. `BILLING_CHECKOUT_URL` permite mostrar una URL HTTPS de checkout alojado cuando exista la integración; definirla por sí sola no activa una suscripción.
- **Google Calendar y webhooks:** implementar autorización OAuth, almacenamiento seguro de tokens, endpoints autenticados y resolución de duplicados para sincronización bidireccional.

Consulta `docs/architecture.md` para los puntos de extensión.

## Verificación

```bash
npm run typecheck
npm test
npm run build
npm run start
```

Las pruebas ejecutan el SQL real en PostgreSQL local mediante PGlite con una representación mínima de Supabase Auth y sus roles. Comprueban aislamiento de dos empresas, permisos de anónimos, bloqueo por suscripción, campos protegidos, integridad entre tenants y atomicidad de las reservas. No requieren credenciales ni alteran un proyecto remoto. La autenticación y los correos reales se verifican después de conectar tu proyecto Supabase.

```bash
npm run format
npm run lint
```

El análisis inicial de dependencias detectó avisos en la cadena de herramientas de desarrollo (`braces` a través de shadcn/ESLint). No se aplican degradaciones de versión ni `npm audit fix --force`; revisa `npm audit` al actualizar dependencias.
