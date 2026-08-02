# BIO-STOCK LIMS — imagen Docker (frontend Vite + API Express en un solo proceso)
# ───────────────────────────────────────────────────────────────────────────
# La DB SQLite y los secretos viven en /data (montar un volumen para persistir).

# ── Build: compila el frontend y resuelve dependencias (incl. sqlite3 nativo) ──
FROM node:20-bookworm-slim AS build
WORKDIR /app
# Toolchain por si sqlite3 necesita compilar (si hay prebuilt, no se usa)
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --include=dev
# Recompilar sqlite3 desde fuente: el prebuilt exige GLIBC 2.38 y la imagen trae 2.36
RUN npm rebuild sqlite3 --build-from-source
COPY . .
RUN npm run build && npm prune --omit=dev

# ── Runtime: solo lo necesario para correr ─────────────────────────────────────
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/inventario_biorad.db \
    SECRETS_DIR=/data/secrets \
    BACKUPS_DIR=/data/backups
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server.cjs ./
# package.json en runtime → server.cjs expone la versión real en /api/version
# (pkg lo embebe solo; en Docker hay que copiarlo explícitamente).
COPY package.json ./
# Usuario no-root (uid 10001). El volumen /data se chowna en el deploy.
RUN useradd -u 10001 -m -s /usr/sbin/nologin app && mkdir -p /data/secrets /data/backups && chown -R 10001:10001 /data /app
USER app
EXPOSE 3000
# Healthcheck contra el endpoint /health del propio server
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "server.cjs"]
