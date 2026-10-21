import { test } from "node:test";
import assert from "node:assert/strict";
import { authErrorFeedback } from "../lib/auth-errors";

test("Auth distingue límite de correo, dirección no autorizada y credenciales", () => {
  const limit = authErrorFeedback({ code: "over_email_send_rate_limit", status: 429 }, "register");
  const restricted = authErrorFeedback(
    { code: "email_address_not_authorized", status: 403 },
    "register",
  );
  const login = authErrorFeedback({ code: "invalid_credentials", status: 400 }, "login");
  assert.match(limit.error, /límite de correos/);
  assert.match(restricted.error, /configuración de envío/);
  assert.match(login.error, /contraseña no son correctos/);
  assert.notEqual(limit.errorCode, restricted.errorCode);
});

test("Auth distingue fallos de SMTP y de creación de empresa con el mismo código de Supabase", () => {
  const smtp = authErrorFeedback(
    { code: "unexpected_failure", message: "Error sending confirmation email" },
    "register",
  );
  const database = authErrorFeedback(
    { code: "unexpected_failure", message: "Database error saving new user" },
    "register",
  );
  assert.equal(smtp.errorCode, "confirmation_email_error");
  assert.equal(database.errorCode, "signup_database_error");
});

test("Auth no expone mensajes desconocidos, claves ni datos de la solicitud", () => {
  const result = authErrorFeedback(
    {
      code: "untrusted_<script>",
      status: 500,
      message: "Private: demo@example.com password=secret token=sb_secret_example",
    },
    "register",
  );
  assert.equal(result.errorCode, "auth_error");
  assert.doesNotMatch(JSON.stringify(result), /demo@example|password|sb_secret|<script>/);
  // Una propiedad heredada no debe interpretarse como código válido.
  assert.equal(authErrorFeedback({ code: "toString" }, "register").errorCode, "auth_error");
});
