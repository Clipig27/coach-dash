// Data store. Local dev: reads/writes JSON + CSV under ./data.
// On Vercel: set KV_REST_API_URL / KV_REST_API_TOKEN and drafts + approved_sends
// move to Vercel KV automatically (filesystem is read-only / ephemeral in serverless).
import fs from "fs";
import path from "path";
import Papa from "papaparse";
import type { Draft, ApprovedSend, CreatorLP, Goals, RankingRow } from "./types";
import type { Live } from "./thread";

const DATA = path.join(process.cwd(), "data");

function today(): string {
  // ET date, since the whole ops day runs on ET
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  return et.toISOString().slice(0, 10);
}

// ---------- KV (optional) ----------
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const hasKV = Boolean(KV_URL && KV_TOKEN);

async function kvGet<T>(key: string): Promise<T | null> {
  const res = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = await res.json();
  return body.result ? (JSON.parse(body.result) as T) : null;
}

async function kvSet(key: string, value: unknown): Promise<void> {
  await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(JSON.stringify(value)),
  });
}

// ---------- files ----------
function readJSON<T>(rel: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(rel: string, value: unknown): void {
  const p = path.join(DATA, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(value, null, 2));
}

// ---------- drafts ----------
export async function getDrafts(date = today()): Promise<Draft[]> {
  if (hasKV) return (await kvGet<Draft[]>(`drafts:${date}`)) ?? [];
  return readJSON<Draft[]>(`drafts/${date}.json`, []);
}

export async function saveDrafts(drafts: Draft[], date = today()): Promise<void> {
  if (hasKV) return kvSet(`drafts:${date}`, drafts);
  writeJSON(`drafts/${date}.json`, drafts);
}

// ---------- approved sends queue ----------
export async function getQueue(): Promise<ApprovedSend[]> {
  if (hasKV) return (await kvGet<ApprovedSend[]>("approved_sends")) ?? [];
  return readJSON<ApprovedSend[]>("approved_sends.json", []);
}

export async function saveQueue(q: ApprovedSend[]): Promise<void> {
  if (hasKV) return kvSet("approved_sends", q);
  writeJSON("approved_sends.json", q);
}

export async function enqueue(sends: Omit<ApprovedSend, "id" | "approvedAt" | "sent">[]): Promise<ApprovedSend[]> {
  const q = await getQueue();
  const now = new Date().toISOString();
  const added = sends.map((s, i) => ({
    ...s,
    id: `${Date.now()}-${i}`,
    approvedAt: now,
    sent: false,
  }));
  await saveQueue([...q, ...added]);
  return added;
}

// ---------- live Discord threads (pushed by the worker) ----------
export async function getLive(): Promise<Live> {
  const empty: Live = { updatedAt: null, channels: {} };
  if (hasKV) return (await kvGet<Live>("live")) ?? empty;
  return readJSON<Live>("live.json", empty);
}

export async function saveLive(live: Live): Promise<void> {
  if (hasKV) return kvSet("live", live);
  writeJSON("live.json", live);
}

// ---------- read-only daily artifacts ----------
export function getRoster(): { creator: string; channel: string }[] {
  // roster.md lines: "Creator Name | discord-channel"
  try {
    const raw = fs.readFileSync(path.join(DATA, "roster.md"), "utf8");
    return raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const [creator, channel] = l.split("|").map((s) => s.trim());
        return { creator, channel: channel ?? creator.toLowerCase().replace(/\s+/g, "-") };
      });
  } catch {
    return [];
  }
}

export function getChannelOrder(): string[] {
  // discord_channel_order.md: one channel per line, top -> bottom = Discord sidebar order
  try {
    const raw = fs.readFileSync(path.join(DATA, "discord_channel_order.md"), "utf8");
    return raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  } catch {
    return [];
  }
}

export function sortByChannelOrder<T extends { channel: string }>(rows: T[]): T[] {
  const order = getChannelOrder();
  const idx = new Map(order.map((c, i) => [c, i]));
  return [...rows].sort(
    (a, b) => (idx.get(a.channel) ?? 999) - (idx.get(b.channel) ?? 999)
  );
}

export function getLP(date = today()): CreatorLP[] {
  try {
    const raw = fs.readFileSync(path.join(DATA, `lp/creators_${date}.csv`), "utf8");
    const parsed = Papa.parse<Record<string, string>>(raw, { header: true, skipEmptyLines: true });
    return parsed.data.map((r) => ({
      creator: r.creator,
      views: Number(r.views ?? 0),
      posts_last7d_daily: (r.posts_last7d_daily ?? "").split(";").map(Number),
      cpm: Number(r.cpm ?? 0),
      eng: Number(r.eng ?? 0),
      fraud_flags: Number(r.fraud_flags ?? 0),
    }));
  } catch {
    return [];
  }
}

export function getGoals(): Goals {
  return readJSON<Goals>("goals/goals.json", {});
}

export function getRanking(date = today()): RankingRow[] {
  try {
    const raw = fs.readFileSync(path.join(DATA, `ranking/${date}.csv`), "utf8");
    const parsed = Papa.parse<Record<string, string>>(raw, { header: true, skipEmptyLines: true });
    return parsed.data.map((r) => ({
      creator: r.creator,
      effort: Number(r.effort ?? 0),
      output: Number(r.output ?? 0),
      views: Number(r.views ?? 0),
      posts: Number(r.posts ?? 0),
    }));
  } catch {
    return [];
  }
}

export function getTopVideos(date = today()): { creator: string; views: number; link: string }[] {
  try {
    const raw = fs.readFileSync(path.join(DATA, `lp/top_videos_links_${date}.csv`), "utf8");
    const parsed = Papa.parse<Record<string, string>>(raw, { header: true, skipEmptyLines: true });
    return parsed.data.map((r) => ({
      creator: r.creator,
      views: Number(r.views ?? 0),
      link: r.link ?? "",
    }));
  } catch {
    return [];
  }
}

export { today };
