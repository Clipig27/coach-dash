import { NextRequest, NextResponse } from "next/server";
import { getDrafts, saveDrafts, enqueue, today, getLive } from "@/lib/store";
import { PAY, PLACEHOLDER } from "@/lib/rules";
import { markStaff, threadState } from "@/lib/thread";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Guardrails baked into the approve path itself.
const CHANNEL_ALLOW = (ch: string) =>
  // only creator channels; never admin/management channels
  !/admin|management|mgmt|coaches|bts|announcement/i.test(ch);

// POST /api/approve
// Single:  { id, text }            -> approves one draft with the EXACT edited text
// Bulk:    { channels: string[], text }  -> same approved text to a named channel list, one confirmation
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
    const channels: string[] = body.channels.filter(CHANNEL_ALLOW);
    const blocked = body.channels.filter((c: string) => !CHANNEL_ALLOW(c));
    const added = await enqueue(channels.map((channel) => ({ channel, text })));
    return NextResponse.json({ ok: true, queued: added.length, blocked });
  }

  const drafts = await getDrafts(date);
  const d = drafts.find((x) => x.id === body.id);
  if (!d) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!CHANNEL_ALLOW(d.channel)) {
    return NextResponse.json({ error: "channel not allowed" }, { status: 403 });
  }
  // Pay questions are answered by the coach directly, never queued from a draft.
  if (d.flags?.includes("pay_question")) {
    return NextResponse.json({ error: "pay question, answer yourself" }, { status: 403 });
  }
  const text = String(body.text ?? d.draft).trim();
  if (!text) return NextResponse.json({ error: "empty text" }, { status: 400 });
  if (PLACEHOLDER.test(text)) return NextResponse.json({ error: "fill in the [brackets] first" }, { status: 400 });
  // Live check: if their latest unanswered Discord msgs ask about pay, it's yours to answer.
  const live = markStaff(await getLive(), (process.env.COACH_DISCORD_IDS ?? "").split(",").filter(Boolean));
  const { unanswered } = threadState(live.channels[d.channel]);
  if (unanswered.some((m) => PAY.test(m.content))) {
    return NextResponse.json({ error: "their latest msg asks about pay, answer yourself" }, { status: 403 });
  }

  d.approved = true;
  d.approvedText = text;
  d.approvedAt = now;
  await saveDrafts(drafts, date);
  await enqueue([{ channel: d.channel, channelId: d.channelId, text }]);
  return NextResponse.json({ ok: true, queued: 1 });
}
