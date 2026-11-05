import { NextRequest, NextResponse } from "next/server";
import { getQueue, saveQueue } from "@/lib/store";
import { requireWorker } from "@/lib/auth";

export const dynamic = "force-dynamic";

// The worker polls this.
// GET  /api/approved-sends            -> unsent approved messages
// POST /api/approved-sends { ids }    -> mark those ids sent (worker calls after posting)
export async function GET(req: NextRequest) {
  const denied = requireWorker(req);
  if (denied) return denied;
  const q = await getQueue();
  return NextResponse.json({ sends: q.filter((s) => !s.sent) });
}

export async function POST(req: NextRequest) {
  const denied = requireWorker(req);
  if (denied) return denied;
  const { ids } = await req.json();
  const q = await getQueue();
  const now = new Date().toISOString();
  for (const s of q) {
    if (ids.includes(s.id)) {
      s.sent = true;
      s.sentAt = now;
    }
  }
  await saveQueue(q);
  return NextResponse.json({ ok: true });
}
