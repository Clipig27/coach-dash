import { NextRequest, NextResponse } from "next/server";
import { getQueue, saveQueue } from "@/lib/store";
import { syncDrafts } from "@/lib/sends";
import { sendableChannelId } from "@/lib/channels";
import { requireGrok } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Grok Bot polls this, posts each item to Discord, then acks via /api/approved-sends/ack.
// GET (Authorization: Bearer $INGEST_TOKEN)
//   -> { items: [{ id, date, creator, channel, channelId, text }] } for every approved, unsent message
// channelId always comes from config/channel_map.json, never from the draft. Anything that
// fails either channel guardrail is marked failed here and never handed out.
export async function GET(req: NextRequest) {
  const denied = requireGrok(req);
  if (denied) return denied;
  const q = await getQueue();
  const items = [];
  const rejected = [];
  for (const s of q) {
    if (s.status !== "approved") continue;
    const channelId = sendableChannelId(s.channel);
    if (!channelId) {
      s.status = "failed";
      s.error = "channel not in allowlist";
      rejected.push(s);
      continue;
    }
    items.push({ id: s.id, date: s.date ?? null, creator: s.creator ?? null, channel: s.channel, channelId, text: s.text });
  }
  if (rejected.length) {
    await saveQueue(q);
    await syncDrafts(rejected);
  }
  return NextResponse.json({ items });
}
