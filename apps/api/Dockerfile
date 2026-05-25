FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
RUN npm ci

COPY packages/shared/ ./packages/shared/
COPY scripts/ ./scripts/
COPY apps/web/public/ ./apps/web/public/
COPY apps/api/ ./apps/api/
RUN npm run build:shared && npm run generate:haknasot-pdf && npm run build:api

# ---

FROM node:22-alpine
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
RUN npm ci --omit=dev

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3001
CMD ["node", "apps/api/dist/main"]
