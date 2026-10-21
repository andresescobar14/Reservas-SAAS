// Importes de presentación. La activación del plan depende de un pago validado en backend.
export const pricing = {
  trialDays: 14,
  monthlyAmount: 499,
  currency: "MXN",
  period: "mes",
} as const;

export const trialFeatures = [
  "Calendario semanal y mensual",
  "Registro y gestión de reservas",
  "Directorio e historial de clientes",
  "Un espacio privado para tu negocio",
  "Verificación de correo opcional",
] as const;

export const monthlyFeatures = [
  "Todo lo incluido en la prueba",
  "Acceso continuo a tu agenda",
  "Reservas y clientes en un solo lugar",
  "Historial de citas siempre a mano",
  "Una suscripción para tu negocio",
] as const;
