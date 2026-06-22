# syntax=docker/dockerfile:1

# Produkční image Horea (Next.js 15 standalone). Build na VPS přes docker compose.
# NEXT_PUBLIC_* se zapékají do klientského bundlu → musí být build args.

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate
# sharp / nativní moduly na alpine
RUN apk add --no-cache libc6-compat
WORKDIR /app

# --- deps: instalace závislostí z lockfile ---
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# --- builder: build Next.js ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC hodnoty potřebné při buildu (zapečou se do klienta i next.config image patterns)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG R2_PUBLIC_BASE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV R2_PUBLIC_BASE_URL=$R2_PUBLIC_BASE_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm build

# --- runner: štíhlý běhový image ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# standalone výstup: server.js + jen potřebné node_modules
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
