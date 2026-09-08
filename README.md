# Ultimate Rewards — Full Functional Store

Discord OAuth login • Ticket system • Staff panel (role-based) • Glassy golden UI

## Features

- **Everyone** logs in with Discord
- **Members** can create tickets (after paying via UPI QR)
- **Staff** (users with role `1543935007339585630`) automatically get the Staff Panel
- Staff can view all tickets, change status (Open → Paid → Delivered), add notes
- Products with infinite stock
- Your real logo + UPI QR already included

## What you need to do (one-time setup)

### 1. Create Discord Application

1. Go to https://discord.com/developers/applications
2. Click **New Application** → name it `Ultimate Rewards`
3. Go to **OAuth2** → copy **Client ID** and **Client Secret**
4. Under **Redirects** add:
   - `http://localhost:3000/auth/callback` (for testing)
   - `https://YOUR-RENDER-URL.onrender.com/auth/callback` (after you deploy)
5. Go to **Bot** → **Add Bot** → copy the **Bot Token**
6. Enable these Privileged Gateway Intents if shown: Server Members Intent (needed for role check)
7. Invite the bot to your server with this link (replace CLIENT_ID):

```
https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=0&scope=bot
```

(The bot only needs to read member roles.)

### 2. Fill .env

```bash
cp .env.example .env
```

Edit `.env`:

```
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_BOT_TOKEN=...
DISCORD_GUILD_ID=1542542660458385508
STAFF_ROLE_ID=1543935007339585630
SESSION_SECRET=any-long-random-string
BASE_URL=http://localhost:3000
```

### 3. Run locally

```bash
npm install
npm start
```

Open http://localhost:3000

### 4. Deploy free on Render

1. Push this folder to a GitHub repo
2. Go to https://render.com → New → Web Service
3. Connect the repo
4. Settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: add all the variables from `.env`
   - **Important**: set `BASE_URL` to your Render URL (e.g. `https://ultimate-rewards.onrender.com`)
5. After first deploy, go back to Discord Developer Portal and add the new redirect URI

## How staff login works

1. User clicks "Login with Discord"
2. After OAuth, the server asks Discord (using the bot) if that user has role `1543935007339585630` in your server
3. If yes → Staff Panel
4. If no → Member Dashboard

## File structure

```
ultimate-rewards/
├── server.js          # Main backend
├── package.json
├── .env.example
├── db/
│   └── database.js    # SQLite
├── middleware/
│   └── auth.js
└── public/
    ├── index.html     # Landing
    ├── dashboard.html # Member tickets
    ├── staff.html     # Staff panel
    ├── styles.css
    ├── logo.png
    └── qr.png
```

## Notes

- Free Render plans sleep after ~15 min of inactivity (first request may be slow)
- SQLite file is created automatically on first run
- Never share your Bot Token or Client Secret
