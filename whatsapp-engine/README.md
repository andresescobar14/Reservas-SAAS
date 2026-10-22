# Motor de WhatsApp de Reserva

Microservicio Node.js persistente, independiente de Next.js y Vercel. Requiere Node.js 22.19 o posterior. Express escucha en `http://localhost:3001`; no inicia navegadores ni envía mensajes hasta recibir una solicitud autorizada.

`npm start` y `npm run dev` usan los certificados de confianza del sistema con `--use-system-ca`. Esto permite conectar con Supabase en este entorno de Windows manteniendo la validación TLS. Un fallo de red o certificado responde 503; no se presenta como una sesión vencida.

## Arranque local

Las dependencias y Chromium ya se instalaron en este entorno. `.env` se creó con **solo la URL y la clave pública** del proyecto Supabase existente. No se copiaron claves privadas del frontend.

Desde la raíz del repositorio:

```powershell
cd whatsapp-engine
npm start
```

En una segunda terminal, desde la raíz del repositorio:

```powershell
npm run dev
```

Abre `http://localhost:3000/dashboard/whatsapp`, inicia sesión y pulsa **Generar Código QR**. En tu teléfono entra a WhatsApp → Dispositivos vinculados → Vincular un dispositivo. El Dashboard comprueba el estado cada cuatro segundos y actualiza el código cuando WhatsApp lo renueva. Solo el evento real `ready` muestra **Conectado**.

En una instalación nueva:

```powershell
cd whatsapp-engine
npm ci
Copy-Item .env.example .env
```

En Bash usa `cp .env.example .env`. Completa `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` con el mismo proyecto del frontend. No uses `service_role`. Si usas Chrome propio configura `PUPPETEER_EXECUTABLE_PATH`; normalmente Puppeteer descarga el navegador durante `npm ci` y conserva su caché en `.cache/puppeteer`.

## Contrato de la API

Todos los endpoints `/api/whatsapp/*` requieren `Authorization: Bearer <access_token de Supabase>`. El token se envía en una cabecera, nunca en la URL. Se comprueba la identidad con Supabase, la propiedad de la empresa mediante RLS y que tenga una prueba vigente o suscripción activa. Cambiar `companyId` no permite acceder a otra empresa.

| Endpoint                              | Comportamiento                                                                                                                                                                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                         | Estado del proceso, sin datos de usuarios.                                                                                                                                                                                                         |
| `GET /api/whatsapp/status/:companyId` | `CONNECTED`, `DISCONNECTED` o `QR_READY`. Incluye `initializing`, `qr` y `error`. No crea una sesión.                                                                                                                                              |
| `GET /api/whatsapp/qr/:companyId`     | Crea o reutiliza una sesión; espera hasta 15 segundos por el QR. Responde 200 con `qr: "data:image/png;base64,..."`, o 202 si todavía está arrancando. Consultar `/status` para continuar. Si ya está conectada devuelve `CONNECTED` y `qr: null`. |
| `POST /api/whatsapp/send`             | Recibe `{ "companyId": "UUID", "phone": "+525555555555", "message": "Texto" }`. Devuelve `{ "success": true, "messageId": "..." }` al aceptar WhatsApp el envío. No significa confirmación de entrega o lectura.                                   |

El cliente del Dashboard obtiene el access token de su sesión de Supabase y conecta directamente con el motor. `companyId` procede de la página privada del servidor. El código Base64 se renderiza con `<img>`, sin subirlo a un servicio de imágenes.

Errores: 400 entrada inválida, 401 sesión inválida, 403 empresa ajena/suscripción vencida/origen ajeno, 409 WhatsApp desconectado, 422 teléfono sin WhatsApp, 429 límite de envío, 503 inicialización o conexión fallida. No se reintentan envíos automáticamente para evitar duplicar mensajes.

## Sesiones y recursos

- `sessions = new Map()` mantiene una sesión independiente por UUID de empresa. Las solicitudes simultáneas comparten el mismo cliente.
- `LocalAuth({ clientId: companyId })` conserva el perfil en `.wwebjs_auth/session-<companyId>`. Tras reiniciar el motor, pulsa el botón de conexión para restaurar ese perfil; puede volver a conectar sin escanear.
- El QR se reemplaza al recibir cada evento, se retira al autenticar y no se conserva después de un fallo o desconexión. Las esperas HTTP se cancelan al cerrar la petición.
- Un fallo cierra Chromium y permite reintentar. El cierre del proceso intenta destruir los clientes sin cerrar la sesión del teléfono.
- `MAX_SESSIONS=10` limita los navegadores simultáneos; ajusta según la memoria del servidor. El envío admite hasta diez intentos por minuto y empresa y mensajes de hasta 4096 caracteres.
- Los perfiles contienen credenciales de WhatsApp. `.env`, perfiles, cachés y `node_modules` están fuera de Git. No se registran QR, JWT, números de teléfono ni mensajes.

## CORS y producción

Por defecto `CORS_ORIGINS` permite `http://localhost:3000` y `http://127.0.0.1:3000`, incluidas las peticiones preflight con cabecera `Authorization`. No usa `*`. CORS complementa la autenticación, no la sustituye.

Para Railway, Render o un servidor equivalente:

1. Despliega **esta carpeta** como servicio persistente con disco y Chromium/dependencias del sistema disponibles; no como función de Vercel.
2. Configura `HOST=0.0.0.0`, el `PORT` del proveedor, las variables de Supabase y `CORS_ORIGINS=https://reservas-saas-ae.vercel.app`.
3. Monta un disco persistente en `WHATSAPP_AUTH_PATH`. Ejecuta Chromium con usuario sin privilegios y conserva su sandbox. No hay flags `--no-sandbox`.
4. Configura en Next.js `NEXT_PUBLIC_WHATSAPP_ENGINE_URL=https://tu-motor.example` y vuelve a desplegar el frontend. Una página HTTPS necesita un motor HTTPS; `localhost` solo sirve para desarrollo en tu equipo.
5. Una réplica es dueña de cada perfil. Este Map no coordina réplicas distintas: antes de escalar horizontalmente implementa asignación de sesiones y bloqueo distribuido.

El motor está excluido de la subida del frontend por `.vercelignore`.

### Contenedor de producción

`Dockerfile` instala Node.js 24 y el Chrome correspondiente al lockfile, con las dependencias de Linux. `.dockerignore` permite únicamente los archivos de ejecución y evita copiar credenciales, perfiles o cachés del equipo. El proceso de la aplicación y Chrome corren como usuario `node`.

El proveedor debe montar un disco persistente en `/var/lib/whatsapp` y ofrecer un dominio HTTPS. Las variables necesarias están en `production.env.example`. El contenedor acepta el `PORT` asignado por el proveedor; el puerto predeterminado es 3001. `/health` comprueba el proceso HTTP. Para verificar Chrome y la autorización de Supabase hay que generar un QR desde una cuenta autenticada.

Chromium conserva su sandbox. Antes de elegir el plan del proveedor, confirma que el entorno admite ejecutarlo; algunos contenedores administrados restringen los namespaces que necesita. No se añadieron flags para desactivarlo. El contenedor se preparó en Windows sin Docker instalado: queda pendiente construirlo y probar el QR en el host elegido.

Para conectar el servicio publicado a la web, configura `NEXT_PUBLIC_WHATSAPP_ENGINE_URL` en **Production del proyecto Vercel `reservas-saas-ae`**, con la URL HTTPS real del motor, y redespliega ese mismo proyecto. Comprueba primero `/health`, CORS desde el dominio público y que las rutas de sesiones rechacen peticiones anónimas. No configures `localhost` como URL del motor en producción.

### Configuración de Railway

- Fuente: solo `whatsapp-engine/`, con su `Dockerfile`; la web continúa en Vercel.
- Volumen: montar en `/var/lib/whatsapp` antes de vincular teléfonos. Una única réplica.
- Variables: las de `production.env.example`, con la URL y la clave pública del mismo Supabase que utiliza la web. La prueba inicial tiene memoria limitada: comenzar con `MAX_SESSIONS=1`.
- Healthcheck: `/health`. Mantener el servicio activo; no habilitar suspensión por inactividad.
- Dominio: generar el dominio HTTPS del servicio y verificar Chrome/QR antes de configurar la URL pública en Vercel.
- Arranque: conservar el `ENTRYPOINT` del Dockerfile para preparar el volumen y ejecutar Node/Chrome sin privilegios. No sustituirlo por un comando que omita esa preparación.

El 22 de octubre de 2026 se abrió la cuenta Trial, pero el proveedor mantenía suspendidos los builds de los planes Hobby, Free y Trial por una incidencia. El panel no completó la creación del proyecto y no se publicó el motor. Posteriormente se autorizó Railway CLI 5.71.0 exclusivamente en el espacio de trabajo del propietario; `railway init --name reserva-whatsapp-engine` también fue rechazado por Railway con `Deploys have been paused temporarily`. La CLI está autenticada, pero no existe todavía un proyecto o una URL pública del motor. Consultar el [estado del incidente](https://status.railway.com/incident/QH8L8B3E) antes de reintentar. Este registro no confirma un despliegue ni una conexión de WhatsApp en producción.

## Alcance y pruebas

Incluye QR real, persistencia por empresa, consulta de estado y endpoint de envío. **No incluye todavía el worker que recorre reservas y programa recordatorios 24 horas antes**, Google Calendar ni pagos. Vincular un teléfono requiere escanear con el dispositivo del propietario; las pruebas no enlazan teléfonos reales ni envían mensajes.

```powershell
npm test
```

Las pruebas usan clientes WhatsApp controlados y HTTP real en puertos locales efímeros. Comprueban aislamiento, autorización, suscripciones, CORS, rotación del QR, PNG real, inicialización concurrente, fallos, limpieza, validación y frecuencia de envío.

La instalación de `whatsapp-web.js@1.34.7` fija Puppeteer 24.38.0. `npm audit` informa de nueve avisos altos en esa cadena (entre otros, `extract-zip`, sin versión corregida publicada al realizar esta instalación). No se aplicaron degradaciones ni sustituciones incompatibles del navegador; revisa la actualización del proveedor antes de llevar este motor a producción.
