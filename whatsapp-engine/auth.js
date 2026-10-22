const { createClient } = require("@supabase/supabase-js");

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const COMPANY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeCompanyId(value) {
  if (typeof value !== "string" || !COMPANY_ID.test(value)) {
    throw new ApiError(400, "INVALID_COMPANY", "La empresa no es válida.");
  }
  return value.toLowerCase();
}

function createTenantAuthorizer(config, clientFactory = createClient) {
  return async (token, companyId) => {
    // Un cliente aislado por petición: nunca compartir la identidad de dos empresas.
    const supabase = clientFactory(config.supabaseUrl, config.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        headers: { Authorization: `Bearer ${token}` },
        fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(10000) }),
      },
    });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError) {
      const status = Number(authError.status);
      if (authError.name === "AuthRetryableFetchError" || !status || status >= 500) {
        throw new ApiError(
          503,
          "AUTH_UNAVAILABLE",
          "El servicio no pudo conectar con Supabase. Inténtalo de nuevo en unos segundos.",
        );
      }
      throw new ApiError(401, "UNAUTHORIZED", "Inicia sesión de nuevo.");
    }
    if (!user) throw new ApiError(401, "UNAUTHORIZED", "Inicia sesión de nuevo.");
    const { data: company, error } = await supabase
      .from("companies")
      .select("id,owner_id,subscription_status,trial_ends_at")
      .eq("id", companyId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (error)
      throw new ApiError(503, "AUTH_UNAVAILABLE", "No pudimos comprobar el acceso a tu empresa.");
    if (!company) throw new ApiError(403, "FORBIDDEN", "No tienes acceso a esta empresa.");
    const active =
      company.subscription_status === "active" ||
      (company.subscription_status === "trial" && Date.parse(company.trial_ends_at) > Date.now());
    if (!active)
      throw new ApiError(
        403,
        "SUBSCRIPTION_REQUIRED",
        "Tu empresa necesita una suscripción activa.",
      );
    return { userId: user.id, companyId: company.id };
  };
}

module.exports = { ApiError, createTenantAuthorizer, normalizeCompanyId };
