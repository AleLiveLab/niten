FROM node:22-bookworm-slim
# Fuentes para el texto de las imágenes promocionales
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core fonts-liberation && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production DATA_DIR=/app/data UPLOADS_DIR=/app/uploads
VOLUME ["/app/data", "/app/uploads"]
EXPOSE 3000
CMD ["node", "server/index.js"]
