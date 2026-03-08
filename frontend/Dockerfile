# ─────────────────────────────────────────────────────────────────
# Stage 1 — Vite build
#   BACKEND_URL is baked in at build time.
#   For ECS: pass --build-arg BACKEND_URL="" (empty = use nginx proxy at same origin)
#   For standalone: pass --build-arg BACKEND_URL=https://api.yourdomain.com
# ─────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

ARG BACKEND_URL=""
ENV VITE_API_URL=${BACKEND_URL}

COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline

COPY . .
RUN npm run build

# ─────────────────────────────────────────────────────────────────
# Stage 2 — Nginx runtime with envsubst support
#   nginx.conf.template is processed at container startup to replace
#   $BACKEND_HOST with the actual backend address.
# ─────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

LABEL org.opencontainers.image.title="CloudAudit Frontend"
LABEL org.opencontainers.image.version="4.0.0"

# Install gettext for envsubst (tiny, ~500KB)
RUN apk add --no-cache gettext

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Template — $BACKEND_HOST is replaced at container start
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Static assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

# nginx official image automatically processes /etc/nginx/templates/*.template
# using envsubst, so no custom entrypoint needed
CMD ["nginx", "-g", "daemon off;"]