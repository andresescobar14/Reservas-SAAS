FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit
COPY --chown=node:node server.js native-automation.js chat.js quiet-hours.js public-booking.js ./
USER node
EXPOSE 3001
CMD ["node", "--use-system-ca", "server.js"]
