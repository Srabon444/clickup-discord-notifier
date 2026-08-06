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

See `.env.example` for the full list of required environment variables and
`supabase/*.sql` for the database schema.
