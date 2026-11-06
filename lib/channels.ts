// Send guardrails. Both must pass before Grok Bot ever sees a message:
// 1. name blocklist (never admin/management/coaches/announcement channels)
// 2. explicit allowlist in config/channel_map.json (Christian's 41 creator channels, name -> Discord ID)
import fs from "fs";
import path from "path";

export const CHANNEL_ALLOW = (ch: string) => !/admin|management|mgmt|coaches|bts|announcement/i.test(ch);

export function getChannelMap(): Record<string, string> {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "config", "channel_map.json"), "utf8"));
    const map: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) if (k !== "_comment" && /^\d{17,20}$/.test(String(v))) map[k] = String(v);
    return map;
  } catch {
    return {};
  }
}

// Discord channel ID for a sendable channel, or null if either guardrail rejects it.
export function sendableChannelId(channel: string): string | null {
  if (!CHANNEL_ALLOW(channel)) return null;
  return getChannelMap()[channel] ?? null;
}
