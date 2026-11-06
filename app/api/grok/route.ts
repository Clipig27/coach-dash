import { NextRequest, NextResponse } from "next/server";
import { getQueue } from "@/lib/store";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const URL_ = process.env.GROK_WEBHOOK_URL;
const KEY = process.env.GROK_WEBHOOK_KEY;

const pending = async () => (await getQueue()).filter((s) => s.status === "approved").length;

// GET  -> { enabled, pending } for the "Send All Approved via Grok" button
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  return NextResponse.json({ enabled: Boolean(URL_ && KEY), pending: await pending() });
}

// POST -> pings Grok Bot to send everything approved now. Only a nudge: Grok still pulls
// the exact approved text from /api/approved-sends, so nothing unapproved can go out.
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  if (!URL_ || !KEY) return NextResponse.json({ error: "GROK_WEBHOOK_URL / GROK_WEBHOOK_KEY not set" }, { status: 400 });
  const count = await pending();
  if (!count) return NextResponse.json({ ok: true, count: 0 });
  const res = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ count }),
  }).catch((e: Error) => ({ ok: false, status: 0, statusText: e.message }) as Response);
  if (!res.ok) return NextResponse.json({ error: `webhook ${res.status} ${res.statusText}` }, { status: 502 });
  return NextResponse.json({ ok: true, count });
}
