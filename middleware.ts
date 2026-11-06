// Gates every page + API behind ADMIN_TOKEN (API routes also check it themselves).
// Open the app once as /?token=YOURTOKEN; that sets a cookie so the queue's fetches work.
import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return NextResponse.next(); // no token set = local dev, open

  // Grok Bot endpoints check INGEST_TOKEN themselves
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

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return new NextResponse(LOGIN, { status: 401, headers: { "content-type": "text/html; charset=utf-8" } });
}

// Shown instead of a bare 401 when a browser has no login cookie yet (new device, cleared cookies).
const LOGIN = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Coach Dash</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f1115;color:#e8eaf0;font:14px -apple-system,Segoe UI,Roboto,sans-serif}
form{background:#171a21;border:1px solid #2a2f3a;border-radius:10px;padding:20px;width:min(340px,calc(100vw - 32px))}
h1{font-size:16px;margin:0 0 12px}input{width:100%;box-sizing:border-box;padding:9px 10px;border-radius:8px;border:1px solid #2a2f3a;background:#1e222b;color:#e8eaf0;font:inherit}
button{margin-top:10px;width:100%;padding:9px 16px;border:0;border-radius:8px;background:#5865f2;color:#fff;font-weight:600;cursor:pointer}
</style></head><body><form method="get"><h1>Coach Dash</h1>
<input name="token" type="password" placeholder="Admin token" autofocus autocomplete="current-password">
<button>Log in</button></form></body></html>`;

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
