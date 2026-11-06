import { NextRequest, NextResponse } from "next/server";
import { getDrafts, saveDrafts, sortByChannelOrder, today, latestDraftsDate } from "@/lib/store";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/drafts?date=YYYY-MM-DD -> drafts in Discord sidebar order
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const asked = req.nextUrl.searchParams.get("date");
  let date = asked ?? today();
  let drafts = await getDrafts(date);
  if (!asked && !drafts.length) {
    const latest = latestDraftsDate(date);
    if (latest) {
      date = latest;
      drafts = await getDrafts(date);
    }
  }
  return NextResponse.json({ date, today: today(), drafts: sortByChannelOrder(drafts) });
}

// PATCH /api/drafts  { id, draft?, tab? } -> edit a draft in place (no send)
export async function PATCH(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const body = await req.json();
  const date = body.date ?? today();
  const drafts = await getDrafts(date);
  const d = drafts.find((x) => x.id === body.id);
  if (!d) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (d.approved && !d.sendError) return NextResponse.json({ error: "already approved" }, { status: 409 });
  if (typeof body.draft === "string") {
    if (d.botDraft === undefined) d.botDraft = d.draft; // drafts uploaded before botDraft existed
    d.draft = body.draft;
  }
  if (["respond_now", "needs_you_first", "missed_yesterday", "at_risk", "skipped"].includes(body.tab)) d.tab = body.tab;
  await saveDrafts(drafts, date);
  return NextResponse.json({ ok: true, draft: d });
}
