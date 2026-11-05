// Single-user auth: every API call and page requires ADMIN_TOKEN.
// Set ADMIN_TOKEN in Railway vars. Worker uses WORKER_TOKEN for the poll endpoint.
import { NextRequest, NextResponse } from "next/server";

export function requireAdmin(req: NextRequest): NextResponse | null {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return null; // no token set = local dev, open
  const got =
    req.headers.get("x-admin-token") ??
    req.nextUrl.searchParams.get("token") ??
    req.cookies.get("admin_token")?.value;
  if (got !== token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export function requireWorker(req: NextRequest): NextResponse | null {
  const token = process.env.WORKER_TOKEN ?? process.env.ADMIN_TOKEN;
  if (!token) return null;
  const got = req.headers.get("x-worker-token");
  if (got !== token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
