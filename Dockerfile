# syntax=docker/dockerfile:1.7-labs
# AEGIS HSSE Platform — Production Dockerfile (multi-stage)
# Final image: ~150MB based on Node 22 Alpine + Next.js standalone output

# ─────────────────────────────────────────────────────────────────────────
# Stage 1: dependencies
# ─────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# OpenSSL for Prisma + tini for proper signal handling
RUN apk add --no-cache openssl libc6-compat

COPY package.json package-lock.json* ./
COPY prisma ./prisma

RUN npm ci --include=dev && \
    npx prisma generate

# ─────────────────────────────────────────────────────────────────────────
# Stage 2: build
# ─────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Pre-built dummy env values so build doesn't fail — runtime overrides them.
ENV NEXTAUTH_SECRET="dummy-build-secret-replaced-at-runtime"
ENV DATABASE_URL="file:./prisma/dev.db"
ENV NODE_ENV=production

RUN npx prisma generate && \
    npm run build

# ─────────────────────────────────────────────────────────────────────────
# Stage 3: production runner
# ─────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root user for security
RUN apk add --no-cache openssl tini && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 aegis

# Copy standalone build output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=aegis:nodejs /app/.next/standalone ./
COPY --from=builder --chown=aegis:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=aegis:nodejs /app/prisma ./prisma
COPY --from=builder --chown=aegis:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=aegis:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client

USER aegis

EXPOSE 3000

# Liveness check baked in — Docker/k8s can use it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/live || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
