FROM node:20-alpine

WORKDIR /usr/src/app

COPY package.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY server.js ./

EXPOSE 8080

ENV NODE_ENV=production

CMD ["npm", "start"]


