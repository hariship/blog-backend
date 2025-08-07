# Use Node.js 18 Alpine for better compatibility
FROM node:18-alpine

# Install Chrome dependencies for Puppeteer and other tools
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    curl

# Set environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production

# Set the working directory in the container
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (production only for smaller image)
RUN npm ci --only=production && npm cache clean --force

# Install global dependencies for container
RUN npm install -g ts-node pm2

# Copy the rest of the application code
COPY . .

# Build TypeScript
RUN npm run build

# Create logs directory
RUN mkdir -p logs

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S bloguser -u 1001 -G nodejs

# Change ownership
RUN chown -R bloguser:nodejs /app /app/logs

# Switch to non-root user
USER bloguser

# Expose the port the server uses
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Use PM2 to run both services
CMD ["npm", "run", "docker:start"]
