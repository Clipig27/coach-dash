import { NextRequest, NextResponse } from "next/server";
import { getLive, saveLive, getRoster } from "@/lib/store";
import { requireAdmin, requireWorker } from "@/lib/auth";
import { markStaff, type LiveMsg } from "@/lib/thread";

export const dynamic = "force-dynamic";

const coachIds = () => (process.env.COACH_DISCORD_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

// GET /api/live -> recent Discord messages per creator channel, staff marked
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  return NextResponse.json(markStaff(await getLive(), coachIds()));
}

// POST /api/live { channels: { name: LiveMsg[] } } -> worker pushes a fresh read of each channel
export async function POST(req: NextRequest) {
  const denied = requireWorker(req);
  if (denied) return denied;
  const body = await req.json();
  const allowed = new Set(getRoster().map((r) => r.channel));
  const live = await getLive();
  for (const [ch, msgs] of Object.entries(body.channels ?? {})) {
    if (allowed.has(ch) && Array.isArray(msgs)) live.channels[ch] = (msgs as LiveMsg[]).slice(-30);
  }
  live.updatedAt = new Date().toISOString();
  await saveLive(live);
  return NextResponse.json({ ok: true, channels: Object.keys(live.channels).length });
}
