FROM node:22-alpine AS dependencies

WORKDIR /app

COPY package*.json ./

RUN npm ci

FROM dependencies AS test

COPY . .

CMD ["npm", "test", "--"]

FROM test AS builder

RUN npm run build
RUN test -f /app/dist/main.js

FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3050

RUN apk add --no-cache postgresql-client

COPY package*.json ./

RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY migrations ./migrations
COPY scripts ./scripts

USER node

EXPOSE 3050

CMD ["node", "dist/main.js"]
