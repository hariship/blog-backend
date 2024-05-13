# Use an official Node runtime as a parent image
FROM node:16-alpine

# Install additional dependencies needed by Puppeteer
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      freetype-dev \
      harfbuzz \
      ca-certificates \
      ttf-freefont

# Set environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
ENV PUPPETEER_EXECUTABLE_PATH /usr/bin/chromium-browser

# Set the working directory in the container
WORKDIR /app

# Copy package.json into the working directory
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the port the server uses
EXPOSE 3001

# Command to run the app
CMD ["node", "server.js"]
