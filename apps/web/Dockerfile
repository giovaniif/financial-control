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
RUN pnpm install --frozen-lockfile

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
