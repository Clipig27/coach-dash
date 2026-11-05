import { NextRequest, NextResponse } from "next/server";
import { getDrafts, saveDrafts, sortByChannelOrder, today } from "@/lib/store";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/drafts?date=YYYY-MM-DD -> drafts in Discord sidebar order
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const date = req.nextUrl.searchParams.get("date") ?? today();
  const drafts = await getDrafts(date);
  return NextResponse.json({ date, drafts: sortByChannelOrder(drafts) });
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
  if (typeof body.draft === "string") d.draft = body.draft;
  if (body.tab) d.tab = body.tab;
  await saveDrafts(drafts, date);
  return NextResponse.json({ ok: true, draft: d });
}
