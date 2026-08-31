FROM mcr.microsoft.com/playwright:v1.62.1-noble

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.mjs ./

RUN mkdir -p /data && chown -R pwuser:pwuser /app /data
USER pwuser

ENV NODE_ENV=production
ENV PORT=8788
ENV EKODI_BROWSER_DATA_DIR=/data

EXPOSE 8788
CMD ["npm", "start"]
