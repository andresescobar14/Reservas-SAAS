#!/bin/sh
set -eu

# Un único directorio de datos explícito para el volumen del contenedor.
if [ "${WHATSAPP_AUTH_PATH:-/var/lib/whatsapp}" != "/var/lib/whatsapp" ]; then
  echo "Monta el disco persistente en /var/lib/whatsapp." >&2
  exit 1
fi

install -d -m 0700 -o node -g node /var/lib/whatsapp
exec gosu node "$@"
