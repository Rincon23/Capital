# syntax=docker/dockerfile:1
# Multi-stage build for the Capital Next.js app. Produces a small runtime image
# from Next's `output: 'standalone'` bundle. Build it on the target arch
# (e.g. arm64 on an Orange Pi) or with `docker buildx --platform`.

# ---- deps: install node_modules (cached unless the lockfile changes) ----------
FROM node:22-slim AS deps
WORKDIR /app
# Toolchain for any native module without an arm64 prebuild.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: compile the app ----------------------------------------------
FROM node:22-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* are inlined into the client bundle at build time, so they must be
# passed as build args. APP_ALLOWED_ORIGINS is baked into the server config too.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG APP_ALLOWED_ORIGINS
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    APP_ALLOWED_ORIGINS=$APP_ALLOWED_ORIGINS

RUN npm run build

# ---- runner: minimal runtime image ---------------------------------------
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN useradd --system --uid 1001 --create-home nextjs

# `standalone` does not include public/ or the static assets — copy them in.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
