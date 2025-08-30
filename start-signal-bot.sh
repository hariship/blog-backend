#!/bin/bash

# Start Signal Bot Daemon
echo "🤖 Starting Signal Slack Bot..."

# Check if signal-cli is installed
if ! command -v signal-cli &> /dev/null; then
    echo "❌ signal-cli is not installed or not in PATH"
    echo "Please install signal-cli first: brew install signal-cli"
    exit 1
fi

# Check if TypeScript is compiled
if [ ! -d "dist" ]; then
    echo "📦 Building TypeScript..."
    npm run build
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found"
    echo "Please create .env file with SIGNAL_PHONE_NUMBER configured"
    exit 1
fi

# Check if SIGNAL_PHONE_NUMBER is configured
if ! grep -q "SIGNAL_PHONE_NUMBER=" .env; then
    echo "❌ SIGNAL_PHONE_NUMBER not configured in .env"
    exit 1
fi

echo "✅ Configuration verified"
echo "📱 Starting daemon..."

# Run the daemon
npx ts-node src/signal-daemon.ts