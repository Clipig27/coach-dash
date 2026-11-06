// Single-user auth: every page + API requires ADMIN_TOKEN (cookie, header or ?token=).
// Grok Bot uses INGEST_TOKEN (Bearer) for ingest, live threads and the approved-sends handoff.
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function requireAdmin(req: NextRequest): NextResponse | null {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return null; // no token set = local dev, open
  const got =
    req.headers.get("x-admin-token") ??
    req.nextUrl.searchParams.get("token") ??
    req.cookies.get("admin_token")?.value ??
    "";
  return same(got, token) ? null : NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

// Grok Bot: Authorization: Bearer $INGEST_TOKEN. Off (always 401) until INGEST_TOKEN is set.
export function requireGrok(req: NextRequest): NextResponse | null {
  const token = process.env.INGEST_TOKEN;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (token && same(got, token)) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
