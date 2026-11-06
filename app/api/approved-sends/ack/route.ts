import { NextRequest, NextResponse } from "next/server";
import { getQueue, saveQueue } from "@/lib/store";
import { requireGrok } from "@/lib/auth";
import { syncDrafts } from "@/lib/sends";

export const dynamic = "force-dynamic";

// POST /api/approved-sends/ack (Authorization: Bearer $INGEST_TOKEN)
//   { sentIds: string[], failed: [{ id, error }] }
// Ack each message right after posting it, so a crash never causes a repeat send.
export async function POST(req: NextRequest) {
  const denied = requireGrok(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const sentIds = new Set<string>(Array.isArray(body.sentIds) ? body.sentIds.map(String) : []);
  const failed = new Map<string, string>(
    Array.isArray(body.failed) ? body.failed.map((f: { id: unknown; error?: unknown }) => [String(f.id), String(f.error ?? "send failed")]) : []
  );
  const q = await getQueue();
  const now = new Date().toISOString();
  const changed = [];
  const unknown = [];
  for (const id of Array.from(sentIds).concat(Array.from(failed.keys()))) if (!q.some((s) => s.id === id)) unknown.push(id);
  for (const s of q) {
    if (sentIds.has(s.id) && s.status !== "sent") {
      s.status = "sent";
      s.sentAt = now;
      s.error = undefined;
      changed.push(s);
    } else if (failed.has(s.id) && s.status === "approved") {
      s.status = "failed";
      s.error = failed.get(s.id);
      changed.push(s);
    }
  }
  await saveQueue(q);
  await syncDrafts(changed);
  return NextResponse.json({ ok: true, updated: changed.length, unknown });
}
