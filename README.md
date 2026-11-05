# Coach Dash

Approve UI + daily brief for your Higgsfield cohort. One URL, Discord-ordered cards,
edit drafts in place, mash Approve, and a worker posts the exact approved text to Discord.

Nothing goes out without your Approve. The approve API hard-blocks any channel whose
name looks like admin/management/coaches/announcements.

## Pages

- `/` Respond-now queue. Tabs: Respond now / Needs you first / Missed yesterday / At risk.
  Cards show name, channel, summary, editable draft, Approve + Skip. Bulk bar at top:
  pick channels, one confirmation, same message queued to all. Pay-flagged cards can't
  be approved (you answer those yourself).
- `/brief` Daily brief, Discord-paste style with a Copy button. No pay rates ever render here.
- `/goals` Each creator vs their OWN stated goals, Discord sidebar order. No-goals creators listed for the "ask for 3 goals" nudge.
- `/rankings` Effort + output tables (from ranking CSV, or computed from LP data as fallback).

## Data (matches your bot's shapes)

Drop your bot's daily artifacts into `data/`:

```
data/
  roster.md                      # "Creator Name | discord-channel", 41 lines
  discord_channel_order.md       # one channel per line, sidebar order
  goals/goals.json
  drafts/YYYY-MM-DD.json         # the bot writes drafts here (or POST them later)
  lp/creators_YYYY-MM-DD.csv     # creator,views,posts_last7d_daily(;-sep),cpm,eng,fraud_flags
  lp/top_videos_links_YYYY-MM-DD.csv
  ranking/YYYY-MM-DD.csv
```

Sample data for today is included so the app runs immediately.

## Run locally

```
npm install
npm run dev     # http://localhost:3000
```

## Deploy to Railway

One repo, two services in one Railway project.

**web** (repo root)
- Build `npm run build`, start `npm start` (Railway sets `PORT`).
- Volume mounted at `/app/data`. Drafts, the send queue, LP/ranking CSVs and goals live there.
- `roster.md` + `discord_channel_order.md` come from the repo and are copied onto the volume on every start, so edit them here and redeploy.
- Vars: `ADMIN_TOKEN`, `WORKER_TOKEN`, `INGEST_TOKEN`. Leave `KV_REST_API_*` unset.
- Open `https://<web-domain>/?token=ADMIN_TOKEN` once per browser; it sets a 90-day cookie. Everything else returns 401.

**worker** (root directory `worker`)
- Start `npm start`. No volume, no public domain.
- Vars: `DASH_URL=https://<web-domain>`, `WORKER_TOKEN` (same as web), `DISCORD_BOT_TOKEN`.

## The worker (Discord side)

`worker/send-worker.mjs` polls `GET /api/approved-sends` every 15s and posts each
message via the Discord API, then marks it sent.

Setup:
1. Create a bot at discord.com/developers, enable it, invite it to Higgsfield x GOOD Marketing with Send Messages only in your creator channels. Use a BOT token. Do not automate your personal account (self-botting breaks Discord ToS and can get your account banned, which would be a disaster mid-campaign).
2. Fill `worker/channel_map.json` with channel name -> channel ID for your 41 channels only. The worker refuses anything not in the map, which is your second guardrail on top of the API's channel blocklist.
3. Run it anywhere that stays on:

```
cd worker
DASH_URL=https://your-app.up.railway.app \
WORKER_TOKEN=... \
DISCORD_BOT_TOKEN=... \
node send-worker.mjs
```

## Grok Bot ingest

After the 8am ET run, Grok Bot uploads each file with `INGEST_TOKEN` (write-only, it can't approve or send):

```
curl -X POST "$DASH_URL/api/ingest?path=drafts/2026-11-05.json" \
  -H "Authorization: Bearer $INGEST_TOKEN" --data-binary @drafts/2026-11-05.json
```

Allowed paths: `drafts/DATE.json`, `lp/creators_DATE.csv`, `lp/top_videos_links_DATE.csv`, `ranking/DATE.csv`, `goals/goals.json`.
Drafts are forced to unapproved, drafts for channels outside the roster are dropped, anything mentioning pay/base/$ is
flagged + blanked, and drafts you already approved/skipped are never overwritten. Grok Bot must not send to Discord itself;
the worker is the only sender.

## Wiring your existing bot

Your current bot keeps doing collection (chats, LP scrape, drafts). Point it at this app:
- Write `drafts/YYYY-MM-DD.json` in the shape in `lib/types.ts` (same as your current shape, plus `tab`).
- It can also read `GET /api/approved-sends` itself instead of running the worker, if it already has Discord access.

## Hard rules enforced in code

- Approve required before anything is queued. Bulk = one confirm for text + channel list.
- Channel allowlist: admin/management/coaches/announcement names rejected at the API, and the worker only posts to channels in its explicit map.
- Pay-flagged drafts can't be approved from the UI.
- Brief page renders no pay rates.
