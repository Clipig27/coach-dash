// Gates every page + API behind ADMIN_TOKEN (API routes also check it themselves).
// Open the app once as /?token=YOURTOKEN; that sets a cookie so the queue's fetches work.
import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return NextResponse.next(); // no token set = local dev, open

  // worker + bot endpoints check their own WORKER_TOKEN / INGEST_TOKEN
  if (/^\/api\/(approved-sends|ingest|live)(\/|$)/.test(req.nextUrl.pathname)) return NextResponse.next();

  if (req.nextUrl.searchParams.get("token") === token) {
    const res = NextResponse.next();
    res.cookies.set("admin_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 90,
    });
    return res;
  }

  const got = req.cookies.get("admin_token")?.value ?? req.headers.get("x-admin-token");
  if (got === token) return NextResponse.next();

  return req.nextUrl.pathname.startsWith("/api/")
    ? NextResponse.json({ error: "unauthorized" }, { status: 401 })
    : new NextResponse("unauthorized", { status: 401 });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
