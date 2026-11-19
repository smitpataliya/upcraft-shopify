# Production Dockerfile for Upcraft Shopify
FROM node:22-alpine

WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application code and pre-compiled client bundle
COPY src/ ./src/

# Data directory for persistent SQLite database
RUN mkdir -p /app/data

EXPOSE 4000

ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

CMD ["node", "src/server/index.js"]
