# Coach Dash

Approve UI + daily brief for your Higgsfield cohort. One URL, Discord-ordered cards,
edit drafts in place, mash Approve, and Grok Bot posts the exact approved text to Discord.

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

One service (repo root). Build `npm run build`, start `npm start` (Railway sets `PORT`).
- Volume at `/app/data`: drafts, send queue, live threads, LP/ranking CSVs, goals.
- `roster.md` + `discord_channel_order.md` come from the repo and are copied onto the volume on every start.
- `config/channel_map.json` (channel name -> Discord ID, your 41 only) ships with the repo, outside the volume.
- Vars: `ADMIN_TOKEN`, `INGEST_TOKEN`. Optional: `GROK_WEBHOOK_URL` + `GROK_WEBHOOK_KEY`, `COACH_DISCORD_IDS`. Leave `KV_REST_API_*` unset.
- Open `https://<web-domain>/?token=ADMIN_TOKEN` once per browser (or use the login box); it sets a 90-day cookie.

## Grok Bot API

All calls use `Authorization: Bearer $INGEST_TOKEN`. That token can upload data and pick up approved
messages; it can never approve anything.

**Upload daily files** after the 8am ET run, one file per request:
```
curl -X POST "$DASH_URL/api/ingest?path=drafts/2026-11-05.json" \
  -H "Authorization: Bearer $INGEST_TOKEN" --data-binary @drafts/2026-11-05.json
```
Allowed paths: `drafts/DATE.json`, `lp/creators_DATE.csv`, `lp/top_videos_links_DATE.csv`, `ranking/DATE.csv`, `goals/goals.json`.
Drafts are forced unapproved, non-roster channels dropped, roster names applied, pay/base/$ drafts flagged + blanked,
and drafts already approved/skipped are never overwritten.

**Push live threads** (so cards show what creators said), as often as you like:
```
POST /api/live  { "channels": { "<channel>": [{ "id", "authorId", "author", "bot", "content", "ts", "attachments": [{ "name", "type", "url" }] }] } }
```

**Send approved messages:**
```
GET  /api/approved-sends      -> { "items": [{ "id", "date", "creator", "channel", "channelId", "text" }] }
POST /api/approved-sends/ack  { "sentIds": ["..."], "failed": [{ "id": "...", "error": "..." }] }
```
Post each item's `text` exactly as given to `channelId`, then ack it right away (an un-acked item is handed out
again on the next poll). `channelId` always comes from `config/channel_map.json`.

**Optional nudge:** with `GROK_WEBHOOK_URL` + `GROK_WEBHOOK_KEY` set, the queue shows "Send All Approved via Grok",
which POSTs `{ "count": N }` to the webhook with `Authorization: Bearer $GROK_WEBHOOK_KEY`.

## Hard rules enforced in code

- Approve required before anything is queued. Bulk = one confirm for text + channel list.
- Two channel guardrails: admin/management/coaches/announcement names rejected, and only channels in
  `config/channel_map.json` are ever handed to Grok Bot, with the ID from that map.
- Pay questions: Grok's text can't be approved. Only a reply you rewrote yourself can go out (with a confirm).
- `[CONFIRM: ...]`-style placeholders block approval.
- Brief page renders no pay rates.
