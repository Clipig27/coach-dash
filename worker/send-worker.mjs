// Polls the dashboard for approved sends and posts them to Discord via a BOT token.
// Run anywhere that stays online (your laptop, a VPS, Railway, a cron).
//
// IMPORTANT: use a real Discord BOT (created in the Discord Developer Portal,
// invited to the server with Send Messages permission in your creator channels).
// Automating your personal user account ("self-botting") is against Discord ToS
// and risks your account. A bot token is the supported way.
//
// Env:
//   DASH_URL=https://your-app.up.railway.app
//   WORKER_TOKEN=...            (same as the web service)
//   DISCORD_BOT_TOKEN=...
//   CHANNEL_MAP=./channel_map.json   (maps channel name -> discord channel id)
//
// channel_map.json example: { "nicole-matto": "123456789012345678", ... }

import fs from "fs";

const DASH = process.env.DASH_URL ?? "http://localhost:3000";
const WORKER_TOKEN = process.env.WORKER_TOKEN ?? "";
const BOT = process.env.DISCORD_BOT_TOKEN;
const MAP = JSON.parse(fs.readFileSync(process.env.CHANNEL_MAP ?? "./channel_map.json", "utf8"));

// Safety: refuse to post anywhere that isn't in the explicit map.
async function postToDiscord(channelName, channelId, text) {
  // The map is the only source of channel ids; a send's own channelId must agree with it.
  const id = Object.hasOwn(MAP, channelName) && channelName !== "_comment" ? MAP[channelName] : undefined;
  if (!id) {
    console.warn(`"${channelName}" not in channel_map.json, refusing`);
    return false;
  }
  if (channelId && channelId !== id) {
    console.warn(`channelId ${channelId} for "${channelName}" doesn't match channel_map.json, refusing`);
    return false;
  }
  const res = await fetch(`https://discord.com/api/v10/channels/${id}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${BOT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: text }),
  });
  if (!res.ok) {
    console.error(`discord ${res.status} for ${channelName}: ${await res.text()}`);
    return false;
  }
  return true;
}

// ids already posted by this process, so a failed mark-sent never causes a repeat post
const posted = new Set();
let running = false;

async function markSent(ids) {
  const res = await fetch(`${DASH}/api/approved-sends`, {
    method: "POST",
    headers: { "x-worker-token": WORKER_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) console.error(`mark-sent failed: ${res.status}`);
}

async function tick() {
  // a 41-channel batch takes ~50s; never let a second poll overlap and re-send it
  if (running) return;
  running = true;
  try {
    const res = await fetch(`${DASH}/api/approved-sends`, {
      headers: { "x-worker-token": WORKER_TOKEN },
    });
    if (!res.ok) {
      console.error(`poll failed: ${res.status}`);
      return;
    }
    const { sends } = await res.json();
    for (const s of sends) {
      if (posted.has(s.id)) {
        await markSent([s.id]);
        continue;
      }
      const ok = await postToDiscord(s.channel, s.channelId, s.text);
      if (ok) {
        posted.add(s.id);
        console.log(`sent -> #${s.channel}: ${s.text.slice(0, 60)}`);
        await markSent([s.id]);
      }
      await new Promise((r) => setTimeout(r, 1200)); // gentle rate limit
    }
  } catch (e) {
    console.error(`tick error: ${e.message}`);
  } finally {
    running = false;
  }
}

if (!BOT) {
  console.error("DISCORD_BOT_TOKEN not set");
  process.exit(1);
}
console.log(`worker polling ${DASH} every 15s, ${Object.keys(MAP).filter((k) => k !== "_comment").length} channels allowed`);
setInterval(tick, 15_000);
tick();
