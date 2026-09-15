FROM node:20-alpine AS base
RUN apk add --no-cache openssl

# ─── deps stage ────────────────────────────────────────────
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
# --legacy-peer-deps: eslint-config-next@16 peers eslint>=9 while the repo is
# still on eslint 8 with .eslintrc.json. Nothing in this image runs eslint —
# Next 16 dropped `next lint` — so the conflict is install-time only, and the
# local node_modules is resolved the same way. Drop the flag once the lint
# setup moves to eslint 9 + flat config.
RUN npm ci --legacy-peer-deps

# ─── builder stage ─────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ─── toolbox stage ─────────────────────────────────────────
# Carries the Prisma CLI and the seed script. Compose runs this once, before
# the app starts, so a deployment never needs a manual migrate step.
FROM base AS toolbox
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY prisma ./prisma
COPY lib ./lib
# The job runner ships in this image too — see the `jobs` service.
COPY scripts ./scripts
COPY docker-entrypoint.sh ./
RUN npx prisma generate
RUN chmod +x docker-entrypoint.sh
CMD ["./docker-entrypoint.sh"]

# ─── runner stage ──────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
