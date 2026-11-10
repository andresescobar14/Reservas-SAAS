export const serviceContact = {
  operator: "ANDRES EDUARDO ESCOBAR AYALA",
  country: "Venezuela",
  email: "andresescobar171008@gmail.com",
  updated: "3 de noviembre de 2026",
} as const;

export type LegalSection = { title: string; paragraphs: string[] };

export const privacySections: LegalSection[] = [
  {
    title: "Quién presta el servicio",
    paragraphs: [
      `Reservas - Codesc es un servicio operado por ${serviceContact.operator}, en ${serviceContact.country}. Codesc es la marca del servicio. Para consultas sobre privacidad y solicitudes relativas a tus datos, escribe a ${serviceContact.email}.`,
      "Cada negocio que utiliza el sistema decide qué reservas y clientes registra y debe informar a esas personas sobre el uso de sus datos y obtener las autorizaciones necesarias para enviarles mensajes.",
    ],
  },
  {
    title: "Datos que utiliza la aplicación",
    paragraphs: [
      "Cuenta y negocio: correo de acceso, identificadores de usuario y empresa, nombre del negocio y estado de acceso al servicio. La autenticación se gestiona mediante Supabase Auth.",
      "Reservas y clientes: nombre, teléfono, datos de contacto que el negocio introduce, servicio, fecha, horario, estado de la reserva y autorización de mensajes para esa reserva. No incluyas diagnósticos, expedientes clínicos ni otros datos sensibles en los mensajes de recordatorio.",
      "Integración con Meta: identificadores de la cuenta y el número de WhatsApp Business que autorizas, credencial de acceso, estado de conexión, plantillas, mensajes y respuestas de botones, identificadores y estados de entrega. Si autorizas compartir datos de WhatsApp Business y Meta los entrega, también se pueden recibir contactos y actividad del móvil. Compartir contactos o historial no autoriza enviarles recordatorios.",
      "Operación: registros de solicitudes, consentimiento, cuotas, trabajos programados y errores técnicos necesarios para prestar y proteger el servicio. Si conectas Cal.com, recibimos los datos mínimos de las reservas y sus cambios mediante el webhook de esa integración.",
    ],
  },
  {
    title: "Para qué se usan los datos",
    paragraphs: [
      "Se utilizan para autenticar al propietario, separar los datos de cada negocio, mostrar y gestionar reservas y clientes, conectar la cuenta de WhatsApp elegida y comprobar sus plantillas y permisos.",
      "Cuando el negocio activa la automatización y se cumplen sus requisitos de acceso, plantilla y consentimiento, se programa una confirmación al reservar y un recordatorio previo. Las respuestas de WhatsApp permiten registrar una confirmación, una cancelación o una solicitud de cambio. Los estados de entrega y los registros técnicos ayudan a evitar duplicados y resolver incidencias.",
    ],
  },
  {
    title: "Proveedores e integraciones",
    paragraphs: [
      "El servicio utiliza Vercel para la aplicación web, Supabase para autenticación y base de datos, Railway para el motor de automatización y Meta para WhatsApp Business Platform. Esos proveedores procesan la información necesaria para sus funciones conforme a sus propias condiciones y políticas. La infraestructura puede encontrarse fuera de tu país.",
      "Cal.com participa únicamente si el negocio conecta esa integración. La automatización propia funciona sin Make ni Zapier. Los negocios que comparten información con otros servicios por su cuenta deben revisar sus respectivas políticas.",
    ],
  },
  {
    title: "Protección y conservación",
    paragraphs: [
      "Se emplean conexiones HTTPS, comprobaciones de propietario y separación por empresa. Las credenciales de Meta y los contenidos de actividad de coexistencia gestionados por el motor se almacenan cifrados en el servidor. Estas medidas no equivalen a una garantía de seguridad absoluta.",
      "La actividad de coexistencia gestionada por el motor se conserva hasta siete días desde su recepción. Los contenidos temporales importados desde Cal.com se eliminan después de procesarse o al vencer su plazo de siete días. Las reservas, clientes y otros registros operativos permanecen hasta que se gestione su eliminación o se requiera conservarlos para atender incidencias u obligaciones aplicables.",
      "Desconectar WhatsApp elimina la credencial de esa conexión y detiene su uso en el servicio; no borra automáticamente la cuenta, todas las reservas ni los datos conservados por Meta u otros proveedores. Una solicitud de eliminación puede requerir revisar las copias de seguridad y los datos conservados por cada proveedor. Te informaremos del alcance y de las limitaciones que correspondan a tu solicitud.",
    ],
  },
  {
    title: "Tus solicitudes y controles",
    paragraphs: [
      `Puedes solicitar información, acceso, corrección, exportación o eliminación escribiendo a ${serviceContact.email}. Identifica la cuenta o el negocio al que se refiere la solicitud. Comprobaremos tu relación con los datos antes de entregar información o realizar cambios. No envíes contraseñas, tokens ni documentos de identidad por correo para iniciar la solicitud.`,
      "Si eres cliente final de una clínica u otro negocio, también puedes dirigirte al negocio que registró tu reserva. Las instrucciones públicas de eliminación explican cómo desconectar WhatsApp y pedir que se eliminen tus datos del servicio.",
    ],
  },
  {
    title: "Almacenamiento del navegador y cambios",
    paragraphs: [
      "El acceso autenticado utiliza el almacenamiento y las cookies necesarios para mantener la sesión. La preferencia de tema se guarda en el navegador. El SDK de Meta se carga al preparar voluntariamente una conexión y su uso está sujeto a las opciones y políticas de Meta.",
      "Esta página se actualizará cuando cambie el funcionamiento del servicio o la información de contacto. La fecha indicada permite identificar su versión.",
    ],
  },
];

export const deletionSections: LegalSection[] = [
  {
    title: "1. Detener la conexión con WhatsApp",
    paragraphs: [
      "El propietario puede entrar en Dashboard → WhatsApp y utilizar Desconectar Reservas - Codesc. La operación detiene el uso de la conexión y elimina su credencial del servicio. No elimina la cuenta de WhatsApp Business del teléfono.",
      "Para retirar también la vinculación en Meta, abre la aplicación WhatsApp Business del móvil y consulta Ajustes → Cuenta → Plataforma de WhatsApp Business → Desconectar. Las opciones pueden variar según la versión de la aplicación.",
    ],
  },
  {
    title: "2. Solicitar la eliminación de datos",
    paragraphs: [
      `Escribe a ${serviceContact.email} con el asunto «Eliminación de datos — Reservas - Codesc». Indica el correo de tu cuenta, el negocio al que se refiere la solicitud y si quieres eliminar la cuenta completa o determinados datos vinculados a Meta, clientes o reservas.`,
      "Si eres cliente final, indica el negocio que registró tu reserva y el dato de contacto que utilizaste para ella. También puedes enviar la solicitud directamente a ese negocio.",
      "No incluyas contraseñas, tokens, números de cédula o RIF ni documentos médicos para iniciar la solicitud. Antes de eliminar o entregar información, comprobaremos tu identidad o tu autorización mediante un canal adecuado.",
    ],
  },
  {
    title: "3. Comprobación y respuesta",
    paragraphs: [
      "Las solicitudes se gestionan mediante el correo de soporte; este sitio no ofrece una eliminación instantánea automática de cuentas. Te contactaremos para confirmar el alcance y comunicar el resultado, así como cualquier información que deba conservarse por una obligación aplicable.",
      "Eliminar datos del servicio no elimina por sí solo los mensajes que otras personas conservan en sus teléfonos ni los datos de tus cuentas independientes en Meta, Cal.com u otros proveedores. Las copias de seguridad y los registros que deban conservarse requieren la revisión que corresponda a cada caso.",
    ],
  },
];
