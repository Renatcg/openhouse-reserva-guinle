FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

# Pastas que precisam sobreviver a um novo deploy (produtos cadastrados e fotos).
# No EasyPanel, aponte volumes para /app/data e /app/public/uploads.
RUN mkdir -p data public/uploads/products

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server/index.js"]
