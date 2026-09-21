# Production image for the JS Code Editor (static Vite SPA).
# Build context: repository root (see deploy/docker-compose.yml).

FROM node:22-alpine AS builder

WORKDIR /app

ARG NPM_REGISTRY=https://registry.npmjs.org

RUN npm config set registry "$NPM_REGISTRY" \
  && npm install -g pnpm@11.5.2 \
  && pnpm config set registry "$NPM_REGISTRY"

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY public ./public
COPY src ./src

RUN pnpm build


FROM nginx:1.27-alpine AS runner

# Container-local static server only. Host TLS / routing lives in deploy/nginx.conf.
RUN rm -f /etc/nginx/conf.d/default.conf \
  && printf '%s\n' \
    'server {' \
    '  listen 80;' \
    '  server_name _;' \
    '  root /usr/share/nginx/html;' \
    '  index index.html;' \
    '  location / { try_files $uri $uri/ /index.html; }' \
    '  location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|webp|woff2?)$ {' \
    '    expires 7d;' \
    '    add_header Cache-Control "public, immutable";' \
    '    try_files $uri =404;' \
    '  }' \
    '  gzip on;' \
    '  gzip_types text/plain text/css application/javascript application/json image/svg+xml;' \
    '}' > /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
