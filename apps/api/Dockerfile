# syntax=docker/dockerfile:1

# The API, built from the workspace root: it depends on @fin/contracts, so a
# context narrowed to apps/api could not resolve its own imports.

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

# Manifests first, so a source edit does not re-resolve the whole workspace.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY packages/ packages/
COPY apps/api/ apps/api/
# Contracts first: the API imports its built output, not its source.
RUN pnpm --filter @fin/contracts build && pnpm --filter @fin/api build

FROM base AS runtime
ENV NODE_ENV=production
# Prisma's musl engine, which the Alpine image does not carry.
RUN apk add --no-cache openssl

COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./
COPY --from=build /repo/pnpm-workspace.yaml ./
COPY --from=build /repo/packages/contracts/dist packages/contracts/dist
COPY --from=build /repo/packages/contracts/package.json packages/contracts/
COPY --from=build /repo/packages/contracts/node_modules packages/contracts/node_modules
COPY --from=build /repo/apps/api/node_modules apps/api/node_modules
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/package.json apps/api/
# `prisma migrate deploy` reads all three at start-up.
COPY --from=build /repo/apps/api/prisma.config.ts apps/api/
COPY --from=build /repo/apps/api/src/infrastructure/prisma/schema.prisma \
  apps/api/src/infrastructure/prisma/
COPY --from=build /repo/apps/api/src/infrastructure/prisma/migrations \
  apps/api/src/infrastructure/prisma/migrations
COPY apps/api/docker-entrypoint.sh /usr/local/bin/

WORKDIR /repo/apps/api
USER node

EXPOSE 3333
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
