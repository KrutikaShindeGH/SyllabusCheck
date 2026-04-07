# frontend/Dockerfile — Railway-compatible
# Multi-stage: build with Node, serve with nginx

# ── Stage 1: Build ────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# VITE_API_URL is injected at build time via Railway env vars
# Set it in Railway dashboard: VITE_API_URL=https://your-api.up.railway.app
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ── Stage 2: Serve ────────────────────────────────────────────────────
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# SPA routing — all paths fall back to index.html
COPY nginx.spa.conf /etc/nginx/conf.d/default.conf

# Railway injects $PORT; nginx must listen on it
# We use an entrypoint script to swap the port at runtime
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
