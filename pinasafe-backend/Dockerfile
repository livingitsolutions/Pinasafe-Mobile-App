FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./

RUN npm ci --omit=dev

COPY --chown=node:node src/ ./src/

USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const p=process.env.PORT||4000;const r=require('http').get({host:'127.0.0.1',port:p,path:'/health'},x=>process.exit(x.statusCode===200?0:1));r.on('error',()=>process.exit(1));"


CMD ["npm", "start"]
