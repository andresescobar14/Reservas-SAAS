FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    HOME=/home/node \
    HOST=0.0.0.0 \
    PORT=3001 \
    MAX_SESSIONS=3 \
    WHATSAPP_AUTH_PATH=/var/lib/whatsapp \
    PUPPETEER_CACHE_DIR=/opt/whatsapp-engine/.cache/puppeteer

WORKDIR /opt/whatsapp-engine

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates dumb-init gosu unzip \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json .puppeteerrc.cjs ./

# Instala la versión de Chrome fijada por Puppeteer y sus dependencias de Debian.
RUN npm ci --omit=dev --ignore-scripts --no-audit \
    && apt-get update \
    && npx --no-install puppeteer browsers install chrome --install-deps \
    && rm -rf /var/lib/apt/lists/*

COPY server.js config.js auth.js session-manager.js ./
COPY docker-entrypoint.sh /usr/local/bin/whatsapp-engine-entrypoint
RUN chmod 755 /usr/local/bin/whatsapp-engine-entrypoint

EXPOSE 3001
VOLUME ["/var/lib/whatsapp"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/health', {signal: AbortSignal.timeout(4000)}).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# El init recoge procesos de Chrome; el entrypoint baja a un usuario sin privilegios.
ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/whatsapp-engine-entrypoint"]
CMD ["node", "--use-system-ca", "server.js"]
