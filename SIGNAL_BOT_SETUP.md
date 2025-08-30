# Signal Chat Bot for Slack Status Updates

## Overview
Send Signal messages to your bot to update your Slack status automatically!

**Example:** Text "Having coffee" → Slack status becomes "Having coffee ☕"

## Prerequisites
- signal-cli installed (you have v0.13.18 ✅)
- Signal app on your phone

## Option 1: Using signal-cli with Manual Captcha

### Step 1: Register the number (with captcha workaround)

1. First, try to register normally:
```bash
signal-cli -u +1234567890 register
```

2. If you get a captcha error, use the Signal captcha helper:
   - Go to https://signalcaptchas.org/registration/generate.html
   - Complete the captcha
   - Copy the signalcaptcha:// URL

3. Register with the captcha:
```bash
signal-cli -u +1234567890 register --captcha "signalcaptcha://signal-recaptcha.CAPTCHA_TOKEN_HERE"
```

### Step 2: Verify with SMS code
```bash
signal-cli -u +1234567890 verify SMS_CODE_HERE
```

### Step 3: Test sending a message
```bash
signal-cli -u +1234567890 send -m "Hello from Signal Bot!" RECIPIENT_PHONE_NUMBER
```

## Option 2: Using Docker with signal-cli-rest-api

This is easier and provides a REST API:

### Step 1: Run the Docker container
```bash
docker run -d --name signal-api \
  -p 8080:8080 \
  -v $(pwd)/signal-config:/home/.local/share/signal-cli \
  bbernhard/signal-cli-rest-api:latest
```

### Step 2: Register number via API
```bash
# Register
curl -X POST http://localhost:8080/v1/register/+1234567890

# Verify with SMS code
curl -X POST http://localhost:8080/v1/register/+1234567890/verify/SMS_CODE
```

### Step 3: Send messages via API
```bash
curl -X POST http://localhost:8080/v2/send \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello from Signal Bot!",
    "number": "+1234567890",
    "recipients": ["+9876543210"]
  }'
```

## ⭐ RECOMMENDED: Using Linked Device (Easiest)

Link signal-cli as a device to your existing Signal account:

### Step 1: Generate linking URI
```bash
signal-cli link -n "Signal Bot"
```

This will show a tsdevice:// URI

### Step 2: Link in Signal app
1. Open Signal on your phone
2. Go to Settings > Linked Devices
3. Tap "Link New Device"
4. Scan the QR code or enter the URI

### Step 3: Test
```bash
signal-cli -u YOUR_PHONE_NUMBER send -m "Test from linked device" RECIPIENT_NUMBER
```

## 🚀 Quick Setup Steps

### 1. Link your Signal account:
```bash
npm run signal-link
```
Scan the QR code in Signal app (Settings → Linked Devices)

### 2. Configure environment:
Add to your `.env` file:
```bash
SIGNAL_PHONE_NUMBER=+1234567890  # Your actual phone number
SIGNAL_CLI_PATH=/opt/homebrew/bin/signal-cli
SIGNAL_RECIPIENTS=+1234567890  # Your number (to receive confirmations)
```

### 3. Start the bot:
```bash
npm run signal-bot
```
or
```bash
./start-signal-bot.sh
```

### 4. Test it:
Send a Signal message to yourself with: "Having coffee"
Your Slack status should update automatically!

## 💬 Bot Commands

- **Any text** → Sets as Slack status with auto-detected emoji
- **"clear"** or **"x"** → Clears Slack status  
- **"status"** → Checks current status
- **"help"** → Shows available commands

## 🎯 Examples

| Send this | Slack status becomes |
|-----------|---------------------|
| "Having coffee" | Having coffee ☕ |
| "In a meeting" | In a meeting 📅 |
| "Working from home" | Working from home 🏠 |
| "Out for lunch" | Out for lunch 🍴 |
| "clear" | (status cleared) |

## Advanced Configuration

### Multiple Recipients
```bash
SIGNAL_RECIPIENTS=+918939407232
```

### Custom paths
```bash
SIGNAL_PHONE_NUMBER=+918939407232
SIGNAL_CLI_PATH=/opt/homebrew/bin/signal-cli
SIGNAL_API_URL=http://localhost:8080  # if using docker REST API
SLACK_WEBHOOK_URL=https://522e2754850e.ngrok-free.app/callback  # optional
```