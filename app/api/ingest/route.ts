import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import Papa from "papaparse";
import { getDrafts, saveDrafts, getRoster } from "@/lib/store";
import type { Draft, Tab } from "@/lib/types";

export const dynamic = "force-dynamic";

// Grok Bot pushes its daily artifacts here, one file per request:
//   curl -X POST "$DASH_URL/api/ingest?path=lp/creators_2026-11-05.csv" \
//     -H "Authorization: Bearer $INGEST_TOKEN" --data-binary @lp/creators_2026-11-05.csv
// INGEST_TOKEN can only write these files. It can't approve or send anything.

const DATA = path.join(process.cwd(), "data");
const MAX_BYTES = 2_000_000;
const DATE = "(\\d{4}-\\d{2}-\\d{2})";

const CSV_HEADERS: Record<string, string[]> = {
  lp_creators: ["creator", "views", "posts_last7d_daily"],
  lp_top: ["creator", "views", "link"],
  ranking: ["creator", "effort", "output"],
};

const KINDS: { re: RegExp; kind: "drafts" | "goals" | keyof typeof CSV_HEADERS }[] = [
  { re: new RegExp(`^drafts/${DATE}\\.json$`), kind: "drafts" },
  { re: new RegExp(`^lp/creators_${DATE}\\.csv$`), kind: "lp_creators" },
  { re: new RegExp(`^lp/top_videos_links_${DATE}\\.csv$`), kind: "lp_top" },
  { re: new RegExp(`^ranking/${DATE}\\.csv$`), kind: "ranking" },
  { re: /^goals\/goals\.json$/, kind: "goals" },
];

const TABS: Tab[] = ["respond_now", "needs_you_first", "missed_yesterday", "at_risk"];

// Hard rule: pay/base/$ questions are never auto-drafted. Anything that smells like pay
// gets flagged and its draft blanked, even if the bot didn't flag it.
const PAY = /\$|\bpay(s|ing|out|outs|ment|ments)?\b|\bpaid\b|\bbase\b|\brates?\b|\binvoice\b|\bcompensation\b/i;

function authorized(req: NextRequest): boolean {
  const token = process.env.INGEST_TOKEN;
  if (!token) return false; // ingest is off until a token is set
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function writeAtomic(rel: string, body: string) {
  const p = path.join(DATA, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(`${p}.tmp`, body);
  fs.renameSync(`${p}.tmp`, p);
}

function bad(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rel = req.nextUrl.searchParams.get("path") ?? "";
  const match = KINDS.map((k) => ({ ...k, m: rel.match(k.re) })).find((k) => k.m);
  if (!match) return bad(`path not allowed: ${rel}`);

  const body = await req.text();
  if (!body.trim()) return bad("empty body");
  if (Buffer.byteLength(body) > MAX_BYTES) return bad("file too large");

  if (match.kind === "goals") {
    let goals: unknown;
    try {
      goals = JSON.parse(body);
    } catch {
      return bad("goals.json is not valid JSON");
    }
    if (!goals || typeof goals !== "object" || Array.isArray(goals)) return bad("goals.json must be an object");
    writeAtomic(rel, JSON.stringify(goals, null, 2));
    return NextResponse.json({ ok: true, path: rel });
  }

  if (match.kind === "drafts") return ingestDrafts(match.m![1], body);

  const parsed = Papa.parse<Record<string, string>>(body, { header: true, skipEmptyLines: true });
  const missing = CSV_HEADERS[match.kind].filter((h) => !parsed.meta.fields?.includes(h));
  if (missing.length) return bad(`csv missing columns: ${missing.join(", ")}`);
  writeAtomic(rel, body);
  return NextResponse.json({ ok: true, path: rel, rows: parsed.data.length });
}

async function ingestDrafts(date: string, body: string) {
  let incoming: unknown;
  try {
    incoming = JSON.parse(body);
  } catch {
    return bad("drafts file is not valid JSON");
  }
  if (!Array.isArray(incoming)) return bad("drafts file must be an array");

  const channels = new Set(getRoster().map((r) => r.channel));
  const existing = new Map((await getDrafts(date)).map((d) => [d.id, d]));
  const rejected: string[] = [];
  let payFlagged = 0;
  const out: Draft[] = [];

  for (const raw of incoming as Partial<Draft>[]) {
    const channel = String(raw?.channel ?? "");
    if (!channels.has(channel)) {
      rejected.push(channel || "(no channel)");
      continue;
    }
    const id = String(raw.id ?? `${date}:${channel}`);
    const prev = existing.get(id);
    // Anything I already approved, sent, or skipped stays exactly as it was.
    if (prev && (prev.approved || prev.sent || (prev.tab as string) === "skipped")) {
      out.push(prev);
      existing.delete(id);
      continue;
    }
    existing.delete(id);

    const d: Draft = {
      id,
      date,
      creator: String(raw.creator ?? ""),
      channel,
      channelId: raw.channelId ? String(raw.channelId) : undefined,
      trigger: String(raw.trigger ?? ""),
      summary: String(raw.summary ?? ""),
      draft: String(raw.draft ?? ""),
      flags: Array.isArray(raw.flags) ? raw.flags.map(String) : [],
      tab: TABS.includes(raw.tab as Tab) ? (raw.tab as Tab) : "respond_now",
      // the bot can never mark something approved or sent; only my Approve does that
      approved: false,
      sent: false,
    };
    if (d.flags.includes("pay_question") || PAY.test(`${d.trigger} ${d.summary} ${d.draft}`)) {
      if (!d.flags.includes("pay_question")) d.flags.push("pay_question");
      d.draft = "";
      d.tab = "needs_you_first";
      payFlagged++;
    }
    out.push(d);
  }
  // keep approved/sent/skipped drafts that the bot's new file no longer lists
  for (const prev of Array.from(existing.values())) {
    if (prev.approved || prev.sent || (prev.tab as string) === "skipped") out.push(prev);
  }

  await saveDrafts(out, date);
  return NextResponse.json({ ok: true, path: `drafts/${date}.json`, drafts: out.length, payFlagged, rejected });
}
