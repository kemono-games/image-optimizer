# Install dependencies only when needed
FROM node:18-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++ bash 
WORKDIR /app
COPY package.json yarn.lock* ./
RUN yarn --frozen-lockfile && mv node_modules dev_node_modules
RUN yarn --frozen-lockfile --production

FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/dev_node_modules ./node_modules
COPY . ./
RUN yarn build

FROM node:18-alpine AS runner
WORKDIR /app
COPY --from=runner-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json yarn.lock* ./
COPY optimizer.config.example.js ./optimizer.config.example.js
RUN cp optimizer.config.example.js optimizer.config.js

ENV NODE_ENV production
ENV PORT 3100

EXPOSE 3100

CMD ["yarn", "start"]