# ClickUp → Discord Notifier

Self-hosted bridge that turns ClickUp task activity into clean, color-coded
Discord notifications — no Zapier, no Make, no third-party automation
platform, fully custom code.

**Live:** [clickup-discord-notifier.vercel.app](https://clickup-discord-notifier.vercel.app)

## What it does

- 💬 **New comments** posted to Discord, with real `@mention` pings for
  anyone tagged in the comment
- ✅ **Assignments** ping the new assignee directly
- 🔄 **Status changes** show a color-matched emoji per status (pulled from
  ClickUp's own status color) and ping the assignee — but only when *someone
  else* changed it, not when you update your own ticket
- Every event is logged to a database with delivery status, viewable on a
  password-protected **dashboard**
- A scheduled **watchdog** alerts Discord if the ClickUp webhook itself ever
  goes unhealthy
- Every Friday at 3pm Dhaka time, **Captain Ticket** posts a coverage report
  to a separate Discord channel: any team member with a gap somewhere in
  next Monday–Friday (no active ticket's start/due range covering that day)
  gets @mentioned, with a ✅/❌ per day
- `/tickets-list` slash command: any linked member can privately (ephemeral)
  check their own active tickets for the current Mon–Fri, rate-limited to
  3 uses/day per person — rejected requests never call ClickUp

## How it works

```
ClickUp workspace ──webhook──▶ Vercel API route ──▶ Discord channel
                                      │
                                      ▼
                                 Supabase (event log)
```

1. ClickUp fires a webhook (HMAC-signed) on comment/assignee/status events.
2. The API route verifies the signature, looks up the task for context, and
   builds a Discord embed.
3. The notification posts to Discord and the event logs to Supabase —
   whichever happens, so failures are never silent.
4. A daily job syncs the ClickUp workspace's members into a
   `clickup_users` table (email ↔ Discord ID), which is how mentions resolve
   to real pings.

## Stack

- **Next.js (App Router, TypeScript)** on **Vercel** — webhook receiver +
  dashboard, one deployment
- **Supabase (Postgres)** — event log + ClickUp↔Discord user mapping
- **Vitest** — unit/integration tests, no real network calls
- **GitHub Actions** — CI, a daily member-sync cron, and the webhook watchdog

## Setup

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev
```

| Script | Purpose |
|---|---|
| `npm run get-team-id` | find your ClickUp workspace ID |
| `npm run register-webhook -- <url>` | register the ClickUp webhook |
| `npm run sync-clickup-users` | pull ClickUp members into Supabase |
| `npm run check-webhook-health` | manually run the watchdog check |
| `npm run notify-unassigned-week next` | coverage check for next week (default) |
| `npm run notify-unassigned-week current` | coverage check for current week |
| `npm run notify-unassigned-week prev` | coverage check for previous week |
| `npm run register-slash-command` | register `/tickets-list` with Discord for `DISCORD_GUILD_ID` |

See `.env.example` for the full list of required environment variables and
`supabase/*.sql` for the database schema.

### Setting up `/tickets-list` (one-time, in the Discord Developer Portal)

1. [discord.com/developers/applications](https://discord.com/developers/applications) →
   **New Application** → name it "Captain Ticket" (or anything).
2. **General Information** tab → copy **Application ID** and **Public Key**
   into `DISCORD_APPLICATION_ID` / `DISCORD_PUBLIC_KEY`.
3. **Bot** tab → **Reset Token** → copy it into `DISCORD_BOT_TOKEN` (shown once).
4. **OAuth2 → URL Generator** → scopes: `bot` + `applications.commands` →
   no bot permissions needed → open the generated URL → pick the server → Authorize.
5. Enable Developer Mode in Discord (User Settings → Advanced), right-click
   the server icon → **Copy Server ID** → `DISCORD_GUILD_ID`.
6. Run `npm run register-slash-command` (registers the command for that server, instant).
7. **General Information** tab → **Interactions Endpoint URL** →
   `https://clickup-discord-notifier.vercel.app/api/discord-interactions` →
   Save (Discord pings it immediately to verify — the route must already be deployed).
