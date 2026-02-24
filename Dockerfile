FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Backend deps
COPY package*.json ./
RUN npm ci --omit=dev

# Frontend deps & build
COPY client/package*.json ./client/
RUN cd client && npm ci
COPY client/ ./client/
RUN cd client && npx vite build

# Copy server
COPY server/ ./server/

EXPOSE 3333
ENV NODE_ENV=production
CMD ["node", "server/index.js"]
