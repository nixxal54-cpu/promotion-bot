# Movie Promo Bot

A production-minded, autonomous Telegram group promotion bot and operations dashboard built with **Node.js 22**, **TypeScript**, and the **grammY** bot framework.

Designed specifically to promote your social-connection website inside an active Telegram movie-request group (2,500+ members) running a third-party movie file delivery bot—**operating completely independently and non-intrusively without modifying or interfering with the existing movie bot**.

---

## 🌟 Key Architecture & Highlights

```
                               ┌─────────────────────────────────────────────────────────────┐
                               │                 Telegram Movie Request Group                │
                               │                                                             │
                               │  Member: "Leo 2023"                                         │
                               └──────────────┬───────────────────────────────┬──────────────┘
                                              │                               │
                                              ▼                               ▼
                 ┌─────────────────────────────────────────┐     ┌────────────────────────────┐
                 │ Existing 3rd-Party Movie Bot (Untouched)│     │ Movie Promo Bot (This Bot) │
                 ├─────────────────────────────────────────┤     ├────────────────────────────┤
                 │ • Detects title "Leo 2023"              │     │ • Detects eligible title   │
                 │ • Replies with file buttons             │     │ • Increments counter: 9/10 │
                 │ • Sends file in private chat (/start)   │     │ • Ignores 3rd-party bot    │
                 │ • (Never modified or touched)           │     │ • Reaches 10: posts promo  │
                 └─────────────────────────────────────────┘     └────────────────────────────┘
```

- **Zero-Touch Coexistence**: Never sends MTProto user-session requests; never attempts to hook or modify the third-party movie bot.
- **Smart Heuristic Request Detector**: Counts legitimate movie requests (e.g. `"Leo 2023"`, `"Interstellar 1080p"`, `"Avengers Endgame"`, `"Dune: Part Two"`) while ignoring bot responses, commands, spam links, and casual conversation (`"hi"`, `"how to download"`, `"thanks"`).
- **Transactional Counter & Cooldown Guard**: Default threshold of 10 requests and 30-minute cooldown window.
- **Safe State Transitions (Never Discards Requests)**:
  - If threshold is reached during an active cooldown, the promotion is deferred—requests continue to accumulate (10, 11, 12) without loss.
  - The counter is **never reset until Telegram returns HTTP 200** confirming delivery.
  - If Telegram rejects the send (429 Rate Limit Retry-After or network glitch), the accumulated count is preserved.
- **Dual Storage Engine**:
  - **Local Development**: Built-in SQLite with Write-Ahead Logging (`WAL`) and transactions.
  - **Production on Render**: PostgreSQL with `SELECT ... FOR UPDATE` row locks to prevent race conditions during concurrent webhook delivery.
- **Strict Privacy**: Collects zero personal data, stores no message chat history, zero external analytics, and automatically redacts bot tokens from logs.
- **Web Operations Dashboard**: Real-time KPI counters, Telegram message simulation lab, heuristic detector sandbox, and audit event stream.

---

## 📋 Available Bot Commands

| Command | Permission | Description |
|---|---|---|
| `/start` | Everyone | Bot introduction, purpose, and command overview |
| `/help` | Everyone | Help instructions, diagnostics guide, and admin menu |
| `/connect` | Everyone | Introduces the social-connection website with clean link formatting |
| `/promo_count` | Everyone | Reports current progress towards threshold (e.g. `7 / 10`) |
| `/promo_status` | Everyone | Full status: active state, cooldown status, lifetime promotions |
| `/diagnostics` | Everyone | Diagnostic test checking Chat ID match and Privacy Mode |
| `/promo_on` | Administrators | Enables automatic promotions |
| `/promo_off` | Administrators | Pauses automatic promotions (Instant Kill Switch) |
| `/promo_reset` | Administrators | Resets counter to 0 with explicit confirmation (`/promo_reset confirm` or inline button) |

*Admin authentication verifies either Telegram Group Administrator status (`ctx.getChatMember`) or membership in the configured `ADMIN_USER_IDS` allowlist.*

---

## ⚙️ Telegram Privacy Mode Configuration (Crucial)

By default, Telegram bots added to groups run with **Group Privacy enabled**. In this mode, Telegram only forwards messages starting with `/`, direct mentions (`@botname`), or replies to the bot.

Because group members send movie titles as ordinary text (e.g. `"Leo 2023"`), **Privacy Mode must be disabled**:

1. Message **@BotFather** on Telegram.
2. Send `/setprivacy`.
3. Select your bot.
4. Choose **Disable**.
5. Add your bot to the group and ensure the group administrator allows the bot to read messages.
6. *Note*: If the bot is already in the group, remove it and re-add it to refresh Telegram's permission cache.
7. Send `/diagnostics` in the group to verify message receipt.

---

## 🚀 Local Development Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Populate `.env` with:
- `BOT_TOKEN`: Your bot token from @BotFather
- `GROUP_ID`: Your target Telegram group ID (e.g. `-1001234567890`)
- `WEBSITE_URL`: Your social-connection website URL

### 3. Run Automated Tests
```bash
npm test
```
Runs 30 unit and integration tests covering detection heuristics, threshold transitions, cooldown deferrals, Telegram failure recovery, webhook secret validation, deduplication, and admin authorization.

### 4. Start Development Server & Dashboard
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the interactive dashboard, test titles in the sandbox, or simulate group messages.

---

## ☁️ Production Deployment on Render

### Method A: Deploy with `render.yaml` Blueprint (Recommended)

1. Push this repository to GitHub.
2. Log in to [Render](https://dashboard.render.com).
3. Click **New +** → **Blueprint**.
4. Connect your GitHub repository.
5. Render reads `render.yaml` and provisions:
   - A Node.js Web Service running `npm run start`
   - A PostgreSQL Database instance linked via `DATABASE_URL`
6. Fill in the required environment variables:
   - `BOT_TOKEN`: Telegram bot token from @BotFather
   - `WEBHOOK_URL`: Your Render public URL (e.g. `https://movie-promo-bot.onrender.com`)
   - `GROUP_ID`: Your target group ID
   - `WEBSITE_URL`: Your website URL
7. Click **Apply**. Render will deploy the application and register the Telegram webhook.

---

### Method B: Manual Web Service Configuration on Render

If configuring manually without blueprints:

1. In Render Dashboard, click **New +** → **Web Service**.
2. Connect your GitHub repository.
3. Configure the service settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`
   - **Health Check Path**: `/healthz`
4. In the **Environment Variables** section, add:
   | Key | Value | Notes |
   |---|---|---|
   | `NODE_ENV` | `production` | Enables production optimizations |
   | `PORT` | `3000` | Port for Express server |
   | `RUN_MODE` | `webhook` | Uses Telegram webhooks |
   | `BOT_TOKEN` | `123456789:ABC...` | From @BotFather |
   | `WEBHOOK_URL` | `https://your-service.onrender.com` | Public HTTPS domain |
   | `WEBHOOK_SECRET` | `generate-random-32-chars` | Validates `X-Telegram-Bot-Api-Secret-Token` |
   | `GROUP_ID` | `-1001234567890` | Locks monitoring to this group |
   | `WEBSITE_URL` | `https://your-social-website.com` | Injected into promotion copy |
   | `PROMO_THRESHOLD` | `10` | Eligible requests before promo |
   | `PROMO_COOLDOWN_MINUTES` | `30` | Minimum minutes between promos |
   | `ADMIN_USER_IDS` | `12345678,98765432` | Allowlisted Telegram user IDs |
   | `DATABASE_URL` | `postgres://user:pass@host/db` | Render PostgreSQL connection string |
5. Click **Create Web Service**.

---

## 🔒 Security & Token Rotation

### Rotating a Compromised Bot Token
If your Telegram Bot token is ever exposed:
1. Message **@BotFather** on Telegram.
2. Send `/revoke` and select your bot. BotFather immediately invalidates the old token and issues a new one.
3. Open **Render Dashboard → Environment**.
4. Update `BOT_TOKEN` with the new token and click **Save Changes**.
5. Render will automatically redeploy the service and update the Telegram webhook registration.

---

## 📂 Project Directory Structure

```
├── .env.example              # Environment variables template
├── .gitignore                # Git exclusions (credentials, databases, logs)
├── .prettierrc.json          # Prettier code formatting config
├── eslint.config.js          # ESLint configuration
├── index.html                # Single-page application entry point
├── metadata.json             # AI Studio applet metadata
├── package.json              # Project scripts and dependencies
├── render.yaml               # Render Infrastructure-as-Code blueprint
├── server.ts                 # Full-stack HTTP & webhook server
├── tsconfig.json             # TypeScript compiler settings
├── vitest.config.ts          # Vitest testing configuration
│
├── src/
│   ├── index.ts              # Bot runner & bootstrap script
│   ├── config.ts             # Environment parser and validation logic
│   ├── App.tsx               # Interactive React operations dashboard
│   ├── main.tsx              # React mounting entry
│   ├── index.css             # Tailwind CSS styles
│   │
│   ├── bot/
│   │   ├── createBot.ts      # grammY bot initialization
│   │   ├── commands.ts       # Bot command handlers (/start, /help, /promo_*)
│   │   ├── messageHandler.ts # Message routing & group request filtering
│   │   └── adminAuth.ts      # Authorization checks (allowlist + group admin)
│   │
│   ├── detection/
│   │   └── movieRequestDetector.ts # Heuristic title & format detector
│   │
│   ├── promotions/
│   │   ├── promotionService.ts     # State machine coordinator
│   │   └── promotionMessage.ts     # Safe HTML copy builder
│   │
│   ├── storage/
│   │   ├── interface.ts      # Abstract persistence interface
│   │   ├── sqlite.ts         # SQLite WAL storage for local dev
│   │   ├── postgres.ts       # PostgreSQL storage with row locks
│   │   ├── memory.ts         # In-memory mock storage for testing
│   │   ├── index.ts          # Storage factory
│   │   └── migrations/
│   │       └── schema.sql    # Relational schema
│   │
│   ├── webhook/
│   │   ├── server.ts         # Express routes & dashboard APIs
│   │   └── telegramWebhook.ts# Webhook validation & dispatch
│   │
│   └── logging/
│       └── logger.ts         # Sanitizing structured logger
│
└── tests/
    ├── detection.test.ts     # Movie title detection tests
    ├── promotion.test.ts     # Counter, threshold & cooldown tests
    ├── commands.test.ts      # Command authorization & reset tests
    ├── security.test.ts      # Webhook security & bot filtering tests
    └── storage.test.ts       # Persistence & deduplication tests
```

---

## ⚠️ Known Limitations & Telegram API Realities

1. **Heuristic Free-Text Matching**: Because members type natural text, single-word dictionary titles like `"Her"` or `"Up"` can be ambiguous. The detector pairs titles with release years, resolution tags (`1080p`), and word count filters to maximize precision.
2. **Exactly-Once Delivery**: The Telegram Bot API does not provide an `Idempotency-Key` header for `sendMessage`. If Telegram successfully dispatches a promotional post to the group but drops the TCP connection before sending the HTTP 200 response, a retry could theoretically duplicate the message. The bot mitigates this with an in-memory execution mutex and transactional commits.
3. **Render Free-Tier Sleep**: Render free-tier web services sleep after 15 minutes of inactivity. When a new Telegram webhook update arrives, Render takes 30-50 seconds to cold-start. For uninterrupted real-time responsiveness in active 2,500+ member groups, upgrading to Render's **Starter** tier ($7/mo) or setting up an uptime monitor (e.g. UptimeRobot pinging `/healthz`) is recommended.

---

## License

Apache-2.0
