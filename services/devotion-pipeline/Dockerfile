FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
USER node
EXPOSE 8790
CMD ["node","src/server.js"]
