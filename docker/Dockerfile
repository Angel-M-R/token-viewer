FROM node:22 AS build
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @tokenviewer/core build
RUN pnpm --filter server build
RUN if [ -d apps/web ]; then pnpm --filter web build; else mkdir -p apps/web/dist; fi
RUN pnpm deploy --filter server --prod --legacy /prod/server

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8484
ENV DB_PATH=/data/tokenviewer.db
ENV WEB_DIST=/app/web

COPY --from=build /prod/server ./
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/server/src/db/migrations ./dist/db/migrations
COPY --from=build /app/apps/web/dist /app/web

EXPOSE 8484
CMD ["node", "dist/index.js"]
