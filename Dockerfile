FROM node:20-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Run as non-root for least privilege.
RUN addgroup -S titanbot && adduser -S titanbot -G titanbot && \
    chown -R titanbot:titanbot /usr/src/app
USER titanbot

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=40s \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
