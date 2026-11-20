# syntax=docker/dockerfile:1
# Node 26 is the current Active LTS; Node 25 is EOL (2026-06-01) and its image
# is frozen. Since Node 25 the official distribution no longer bundles
# Corepack, so pnpm is installed directly at the version declared once in
# package.json "packageManager".
#
# The base is pinned by digest so an upstream tag rebuild cannot change the
# image silently — a base change becomes a reviewed Dependabot diff. This is
# the newest node:26-alpine digest published as of the image-scan triage
# (2026-11-11); see docs/agents/security.md.
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS base
# The base image can lag Alpine's package repository: the image published from
# main (sha-fadc98d and later) shipped libcrypto3/libssl3 3.5.9-r0 and zlib
# 1.3.2-r1, which the image scan reports as MEDIUM although the repository
# already has 3.5.9-r1 and 1.4-r0. Upgrade only the flagged packages, by name,
# so the change is auditable and becomes a no-op once the base catches up.
RUN apk upgrade --no-cache libcrypto3 libssl3 zlib \
 && apk add --no-cache libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json ./
RUN npm install --global "pnpm@$(node -p 'require("./package.json").packageManager.slice(5)')"

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM base AS builder
ARG STRAPLA_VERSION=dev
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runner
ARG STRAPLA_VERSION=dev
ARG STRAPLA_COMMIT=dev
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 \
    STRAPLA_VERSION=$STRAPLA_VERSION STRAPLA_COMMIT=$STRAPLA_COMMIT
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
# The runtime runs node directly (migrations, `next start`) and never installs a
# package, so the package managers are build-stage tools. Removing them drops
# npm's bundled toolchain (undici, brace-expansion, glob, minimatch, ip-address,
# postcss-selector-parser) from the shipped image, where it was dead code but
# still 6 HIGH and 13 MEDIUM/LOW image-scan findings.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/pnpm \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/pnpm /usr/local/bin/pnpx
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts ./scripts
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node scripts/migrate.mjs && node node_modules/next/dist/bin/next start"]
