# Production Dockerfile for Upcraft Shopify
FROM node:24-alpine

WORKDIR /app

# Copy application files
COPY package.json ./
COPY src/ ./src/
COPY build.js ./

# Create data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 4000

ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

CMD ["node", "src/server/index.js"]

