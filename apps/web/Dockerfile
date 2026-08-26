# syntax=docker/dockerfile:1

# The web app, built from the workspace root: it depends on @fin/contracts.
# The result is static files, so the runtime stage carries no Node at all.

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# Only inside the image. On this machine the link is the same but the cache is
# warm, so none of this should slow a local `pnpm install` down.
#
# The defaults give up while this link is merely slow rather than broken, and
# 16 parallel connections on a link this poor make each other time out.
RUN printf '%s\n' \
  'fetch-retries=5' \
  'fetch-retry-mintimeout=20000' \
  'fetch-retry-maxtimeout=180000' \
  'fetch-timeout=600000' \
  'network-concurrency=4' > .npmrc
# The store is cached on the Docker host between builds, so a deploy that
# changes no dependency fetches almost nothing. `sharing=locked` does two
# jobs: it keeps concurrent builds from corrupting one store, and it stops
# the two images installing against the network at the same time — this
# link cannot carry both, which is what defeated the retry settings.
RUN --mount=type=cache,target=/pnpm/store,sharing=locked \
  pnpm config set store-dir /pnpm/store && \
  pnpm install --frozen-lockfile --filter @fin/web...

FROM deps AS build
COPY packages/ packages/
COPY apps/web/ apps/web/
RUN pnpm --filter @fin/contracts build && pnpm --filter @fin/web build

# Unprivileged by default: listens on 8080 as a non-root user, so nothing here
# needs a capability to bind a port.
FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
