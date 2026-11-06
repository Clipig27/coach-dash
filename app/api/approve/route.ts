import { NextRequest, NextResponse } from "next/server";
import { getDrafts, saveDrafts, enqueue, today, getLive, getRoster } from "@/lib/store";
import { PAY, PLACEHOLDER } from "@/lib/rules";
import { markStaff, threadState } from "@/lib/thread";
import { sendableChannelId } from "@/lib/channels";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/approve
// Single:  { id, date, text }            -> approves one draft with the EXACT edited text
// Bulk:    { channels: string[], text }  -> same approved text to a named channel list, one confirmation
// Approving only queues the text (status "approved"); Grok Bot picks it up from /api/approved-sends.
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const body = await req.json();
  const date = body.date ?? today();
  const now = new Date().toISOString();

  if (Array.isArray(body.channels)) {
    const text = String(body.text ?? "").trim();
    if (!text) return NextResponse.json({ error: "empty text" }, { status: 400 });
    if (PLACEHOLDER.test(text)) return NextResponse.json({ error: "fill in the [brackets] first" }, { status: 400 });
    const names = new Map(getRoster().map((r) => [r.channel, r.creator]));
    const ok = (c: string) => names.has(c) && sendableChannelId(c) !== null;
    const channels: string[] = body.channels.filter(ok);
    const blocked = body.channels.filter((c: string) => !ok(c));
    const added = await enqueue(
      channels.map((channel) => ({ channel, channelId: sendableChannelId(channel)!, creator: names.get(channel), text }))
    );
    return NextResponse.json({ ok: true, queued: added.length, blocked });
  }

  const drafts = await getDrafts(date);
  const d = drafts.find((x) => x.id === body.id);
  if (!d) return NextResponse.json({ error: "not found" }, { status: 404 });
  const channelId = sendableChannelId(d.channel);
  if (!channelId || !getRoster().some((r) => r.channel === d.channel)) {
    return NextResponse.json({ error: "channel not allowed" }, { status: 403 });
  }
  if (d.approved && !d.sendError) return NextResponse.json({ error: "already approved" }, { status: 409 });

  const text = String(body.text ?? d.draft).trim();
  if (!text) return NextResponse.json({ error: "empty text" }, { status: 400 });
  if (PLACEHOLDER.test(text)) return NextResponse.json({ error: "fill in the [brackets] first" }, { status: 400 });

  // Pay questions: never send Grok's text. Only a reply I wrote myself can go out.
  const manual = text !== (d.botDraft ?? d.draft).trim() && text !== d.blockedText;
  const live = markStaff(await getLive(), (process.env.COACH_DISCORD_IDS ?? "").split(",").filter(Boolean));
  const payLive = threadState(live.channels[d.channel]).unanswered.some((m) => PAY.test(m.content));
  if ((d.flags?.includes("pay_question") || payLive) && !manual) {
    return NextResponse.json({ error: "pay question: write the reply yourself, then approve" }, { status: 403 });
  }

  d.approved = true;
  d.approvedText = text;
  d.approvedAt = now;
  d.sendError = undefined;
  await saveDrafts(drafts, date);
  await enqueue([{ draftId: d.id, date, creator: d.creator, channel: d.channel, channelId, text }]);
  return NextResponse.json({ ok: true, queued: 1 });
}
