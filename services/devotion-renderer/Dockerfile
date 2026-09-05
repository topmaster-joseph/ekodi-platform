FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-noto-cjk ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY src ./src

ENV PORT=8787
ENV OUTPUT_DIR=/data/output
ENV CAPTION_FONT_NAME="Noto Sans CJK KR"

RUN mkdir -p /data/output

EXPOSE 8787
CMD ["node", "src/server.js"]
