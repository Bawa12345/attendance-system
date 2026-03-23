# ---- Stage 1: Build ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install ONLY production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# ---- Stage 2: Run ----
FROM node:20-alpine

WORKDIR /app

# Copy production node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application source files (exclude secrets + dev files)
COPY server.js ./
COPY db.js ./
COPY firebase.js.js ./
COPY index.js.js ./

# Cloud Run injects PORT env var (default 8080)
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "server.js"]
