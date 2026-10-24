FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit
COPY --chown=node:node server.js ./
USER node
EXPOSE 3001
CMD ["node", "--use-system-ca", "server.js"]
