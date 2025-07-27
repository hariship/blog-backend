# 📦 Blog Backend

This is a TypeScript-based Express server that supports scraping, email delivery, and RSS feed management.

---

## 🚀 Local Development

### 1. Install dependencies
```bash
npm install
```

### 2. Start the development server
```bash
npm run dev
```
This uses `ts-node-dev` for fast hot-reload and type-safe development.

---

## 📄 Scripts Summary

| Command         | Description                                 |
|----------------|---------------------------------------------|
| `npm run dev`  | Run the server with auto-restart on changes |
| `npm run build`| Compile TypeScript to the `dist/` directory |
| `npm start`    | Run the compiled server from `dist/`        |

---

## 📁 Project Structure

```
src/
├── modules/         # Core logic (e.g., mail module)
├── routes/          # Express routes (mail, client)
├── server.ts        # Entry point
```

---

## ✅ Requirements
- Node.js 18+
- PostgreSQL
- Redis
- Puppeteer-compatible Chromium (installed automatically)

---

## 📬 Email Sending
Ensure `.env` is configured with your SMTP and DB settings. Emails are sent to active subscribers for specific posts.

---

For questions or improvements, open a PR or issue.