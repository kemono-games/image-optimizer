FROM alpine:edge AS base
ENV SHARP_FORCE_GLOBAL_LIBVIPS=1
RUN apk add nodejs yarn npm
WORKDIR /app

FROM base AS deps
ENV SHARP_FORCE_GLOBAL_LIBVIPS=1
RUN apk add python3 make g++ bash vips-dev
COPY package.json yarn.lock* .yarnrc.yml ./
COPY .yarn ./.yarn
RUN yarn workspaces focus --production

FROM deps AS builder
ENV SHARP_FORCE_GLOBAL_LIBVIPS=1
COPY . ./
RUN yarn --immutable
RUN yarn build

FROM base AS runner
ENV SHARP_FORCE_GLOBAL_LIBVIPS=1
RUN apk add ffmpeg vips-dev vips-heif vips-magick
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/sharp ./node_modules/sharp
COPY --from=builder /app/dist ./dist
COPY src ./src
COPY scripts ./scripts
COPY .yarn ./.yarn
COPY package.json .yarnrc.yml yarn.lock* bootstrap.sh cli.sh tsconfig.json ./
COPY optimizer.config.example.js ./optimizer.config.example.js
RUN cp optimizer.config.example.js optimizer.config.js
RUN rm -rf node_modules/@img

ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV FFPROBE_PATH=/usr/bin/ffprobe
ENV NODE_ENV=production
ENV PORT=3100

EXPOSE 3100

ENTRYPOINT ["./bootstrap.sh"]