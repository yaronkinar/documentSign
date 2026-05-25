FROM node:22-alpine AS builder
WORKDIR /app

# NEXT_PUBLIC_* vars are baked into the bundle at build time
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_BYPASS_AUTH
ARG NEXT_PUBLIC_BYPASS_TOKEN

ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_BYPASS_AUTH=$NEXT_PUBLIC_BYPASS_AUTH \
    NEXT_PUBLIC_BYPASS_TOKEN=$NEXT_PUBLIC_BYPASS_TOKEN

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/
RUN npm ci

COPY packages/shared/ ./packages/shared/
COPY apps/web/ ./apps/web/
COPY scripts/ ./scripts/

RUN npm run build:shared && npm run build:web

# ---

FROM node:22-alpine
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/
RUN npm ci --omit=dev

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY apps/web/next.config.js ./apps/web/next.config.js

EXPOSE 3000
CMD ["npm", "run", "start", "-w", "web"]
