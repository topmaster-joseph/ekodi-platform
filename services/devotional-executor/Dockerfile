FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-noto-cjk ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.mjs youtube-oauth.mjs ./

ENV PORT=8789 \
    DEVOTIONAL_WORK_ROOT=/data/devotional \
    DEVOTIONAL_FONT_NAME="Noto Sans CJK KR"

VOLUME ["/data/devotional"]
EXPOSE 8789
CMD ["node", "server.mjs"]