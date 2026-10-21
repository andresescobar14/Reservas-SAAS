import type { ActionResult } from "@/lib/types";

type AuthErrorDetails = { code?: string; status?: number; name?: string; message?: string };

const messages: Record<string, string> = {
  over_email_send_rate_limit:
    "Se alcanzó el límite de correos de confirmación. Espera antes de volver a solicitar uno.",
  over_request_rate_limit:
    "Hay demasiados intentos seguidos. Espera unos minutos antes de volver a intentarlo.",
  email_address_not_authorized:
    "El servicio de correo del proyecto no permite enviar confirmaciones a esta dirección. Revisa su configuración de envío.",
  email_address_invalid: "El proveedor no acepta esta dirección de correo. Revisa la dirección.",
  email_not_confirmed:
    "Tu correo todavía está pendiente de confirmación. Abre el enlace recibido antes de iniciar sesión.",
  invalid_credentials: "El correo o la contraseña no son correctos. Revisa tus datos.",
  user_already_exists:
    "No se puede crear otra cuenta con estos datos. Si ya te registraste, inicia sesión.",
  email_exists:
    "No se puede crear otra cuenta con estos datos. Si ya te registraste, inicia sesión.",
  weak_password: "La contraseña no cumple los requisitos del proyecto. Elige una más segura.",
  signup_disabled: "El proyecto no está aceptando registros nuevos en este momento.",
  email_provider_disabled:
    "Activa Enable Email provider en Supabase para permitir correo y contraseña. Deja Confirm email desactivado para entrar sin confirmación obligatoria y guarda los cambios.",
  captcha_failed: "No se pudo verificar la protección del formulario. Contacta al administrador.",
  request_timeout: "El servicio de acceso tardó demasiado en responder. Inténtalo más tarde.",
  otp_expired: "El código no es válido o ya expiró. Solicita uno nuevo cuando puedas reenviarlo.",
  otp_disabled:
    "El envío de códigos no está habilitado en el proyecto. Puedes seguir usando tu cuenta.",
};

// Se muestran mensajes controlados, nunca el error completo ni datos de la solicitud.
export function authErrorFeedback(
  error: AuthErrorDetails,
  operation: "login" | "register" | "verify-email",
): ActionResult & { error: string; errorCode: string } {
  if (error.code && Object.hasOwn(messages, error.code)) {
    return { error: messages[error.code], errorCode: error.code };
  }

  // Algunas versiones de Auth agrupan fallos de SMTP y triggers bajo el mismo código.
  // Solo se clasifican mensajes conocidos; el texto original nunca se devuelve.
  if (!error.code || error.code === "unexpected_failure") {
    if (/^database error saving new user\.?$/i.test(error.message ?? "")) {
      return {
        error:
          "No se pudo preparar el espacio de tu negocio por un error de base de datos. Revisa los registros de autenticación del proyecto.",
        errorCode: "signup_database_error",
      };
    }
    if (/^error sending confirmation (email|mail)\.?$/i.test(error.message ?? "")) {
      return {
        error:
          "El servicio de correo no pudo enviar la confirmación. Revisa la configuración de envío del proyecto.",
        errorCode: "confirmation_email_error",
      };
    }
  }

  if (error.status === 429) {
    return { error: messages.over_request_rate_limit, errorCode: "rate_limit" };
  }
  if (error.name === "AuthRetryableFetchError") {
    return {
      error:
        "No pudimos conectar con el servicio de acceso. Revisa la conexión e inténtalo más tarde.",
      errorCode: "auth_connection_error",
    };
  }
  return {
    error:
      operation === "verify-email"
        ? "No se pudo comprobar el correo. Puedes seguir usando tu cuenta e intentarlo más tarde."
        : operation === "register"
          ? "No se pudo crear la cuenta. Revisa los registros de autenticación del proyecto para conocer el motivo."
          : "No pudimos iniciar sesión. Inténtalo más tarde o contacta al administrador.",
    errorCode: "auth_error",
  };
}
