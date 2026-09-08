# Ultimate Rewards v3
Discord OAuth member/staff login + glass blur UI.

Discord server ID: `1542542660458385508`
Staff Team role ID: `1543935007339585630`

Deploy as a Render Web Service:
- Build: `npm install`
- Start: `npm start`

Render environment variables:
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI` = `https://YOUR-RENDER-DOMAIN.onrender.com/auth/discord/callback`
- `SESSION_SECRET` = long random value

Discord OAuth scopes: `identify`, `guilds.members.read`.

Never commit Discord client secrets, session secrets, or Supabase service-role/secret keys to GitHub.
