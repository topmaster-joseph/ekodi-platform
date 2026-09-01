FROM node:24-alpine
USER root
RUN mkdir -p /data/devotion-assets && chown -R node:node /data
WORKDIR /app
COPY package.json ./
COPY src ./src
ENV ASSET_STORE_DIR=/data/devotion-assets
USER node
EXPOSE 8789
CMD ["node","src/server.js"]
