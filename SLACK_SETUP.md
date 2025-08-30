# Slack Status Update Setup

## How to Extract d Cookie

1. **Open Slack in Chrome**
   - Go to your first Slack workspace (e.g., `workspace1.slack.com`)
   - Make sure you're logged in

2. **Open Chrome DevTools**
   - Press F12 or right-click → Inspect
   - Go to the "Application" tab
   - In the left sidebar: Storage → Cookies → https://workspace.slack.com

3. **Find the d Cookie**
   - Look for a cookie named `d`
   - It starts with `xoxd-` followed by a long string
   - Copy the entire value

4. **Repeat for Second Workspace**
   - Switch to your second Slack workspace
   - Repeat steps 2-3

5. **Update .env File**
   ```
   SLACK_WORKSPACE_1=workspace1
   SLACK_D_COOKIE_1=xoxd-[paste-your-first-cookie]
   SLACK_WORKSPACE_2=workspace2  
   SLACK_D_COOKIE_2=xoxd-[paste-your-second-cookie]
   ```

## API Usage

### Update Status (both accounts)
```bash
curl -X POST http://localhost:3000/slack/status \
  -H "Content-Type: application/json" \
  -d '{
    "text": "In a meeting",
    "emoji": "calendar"
  }'
```

### Update Specific Account
```bash
curl -X POST http://localhost:3000/slack/status \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Lunch break",
    "emoji": "pizza",
    "account": "account1"
  }'
```

### Clear Status
```bash
curl -X DELETE http://localhost:3000/slack/status
```

## Signal Bot Integration

Your Signal bot should send a POST request to:
`http://your-server:3000/slack/status`

With JSON body:
```json
{
  "text": "Status message",
  "emoji": "emoji_name"
}
```

## Cookie Expiration

- Cookies typically last 30-90 days
- When expired, you'll see: "Cookie expired for account1. Please update the d cookie."
- Simply repeat the extraction process

## Common Emojis
- `calendar` - 📅 In a meeting
- `coffee` - ☕ On a break
- `house` - 🏠 Working from home
- `airplane` - ✈️ Traveling
- `palm_tree` - 🌴 Vacationing
- `spiral_calendar_pad` - 🗓️ In a call
- `pizza` - 🍕 Lunch
- `zzz` - 💤 Away