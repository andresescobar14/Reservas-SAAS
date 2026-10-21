# Sistema visual de Reserva

> **Actualización:** el tema predeterminado es oscuro (lienzo verde casi negro `#030f0a`, superficies `#071811`) con interruptor a claro. Las variables viven en `:root` (claro) y `.dark` (oscuro) de `app/globals.css`; en `.dark` también se reasignan las escalas de Tailwind (`slate`, `emerald`, `amber`…) para que las utilidades existentes se adapten. El script del layout aplica la preferencia antes del primer pintado. Donde el texto de abajo diga "un único tema claro", rige esta nota.

La referencia compartida por el usuario es Reflect Notes. Se adapta su composición editorial y sus bordes iluminados al tema claro y verde solicitado para Reserva. La referencia visual de precios es la captura de Unicorn Studio compartida en el chat.

## Tokens y tipografía

- Fondo principal blanco; aplicación privada en `slate-50`. Un único tema claro, independiente del sistema operativo. `color-scheme`, componentes y notificaciones usan el mismo tema.
- Color principal `#00875f`, hover `#047857`, focus `#059669`. Los iconos principales, enlaces y checks utilizan verde. Los mensajes de error mantienen su semántica.
- Fuente Inter Variable alojada en el proyecto mediante Fontsource. No requiere descargar fuentes durante `next build`.
- Titulares de peso 500. H1 de portada adaptable hasta 72 px, H2 de marketing entre 36 y 48 px. Los párrafos principales utilizan 16–20 px e interlineado de 1.6–1.8. Las etiquetas y metadatos conservan una escala secundaria de 12–14 px.
- Botones e inputs: 5 px de radio. Tarjetas: 16 px. Badges: 32 px. Navegación flotante: píldora en escritorio y panel compacto en móvil.
- Contenedor de marketing de 1200 px, secciones con 80–112 px de separación y componentes con 24–36 px de padding.
- Brillos interiores tenues, acento degradado exclusivamente en texto y líneas finas. La vista previa se construye con HTML/CSS; no añade imágenes remotas ni un runtime gráfico.

## Componentes

`components/marketing/site-header.tsx` define la navegación pública adaptable. `product-preview.tsx` presenta datos ficticios y enlaza a la demo. `pricing-section.tsx` muestra la prueba gratuita y Reserva Pro, con preguntas desplegables nativas y enlaces reales a registro.

Los importes están centralizados en `lib/pricing.ts`: 14 días de prueba y $499 MXN al mes. La landing y la pantalla de suscripción comparten esa configuración. Son importes de presentación; no activan cobros ni modifican suscripciones. El checkout y su webhook firmado deben aplicar el mismo precio antes de habilitar pagos reales.

La tabla de clientes utiliza el componente oficial `table` de shadcn, con caption accesible y desplazamiento horizontal en pantallas pequeñas. Los controles de formulario y notificaciones comparten los tokens globales.

## Alcance de producto

La agenda, el directorio, la autenticación y el aislamiento por empresa son funcionales con Supabase configurado. WhatsApp, Google Calendar y pagos siguen siendo integraciones pendientes y la interfaz informa de su disponibilidad. Los cambios visuales no modifican las reglas RLS ni el cálculo de la prueba.
