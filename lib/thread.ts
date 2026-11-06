// Live Discord thread for one creator channel, pushed by Grok Bot to /api/live.

export interface LiveMsg {
  id: string;
  authorId: string;
  author: string;
  bot: boolean;
  self?: boolean;       // sent by our sender bot (= an approved reply from Christian)
  staff?: boolean;      // coach/admin (set server-side)
  content: string;
  ts: string;           // ISO
  attachments: { name: string; type: string; url: string }[];
}

export interface Live {
  updatedAt: string | null;
  channels: Record<string, LiveMsg[]>; // oldest -> newest
}

export interface ThreadState {
  unanswered: LiveMsg[];     // creator msgs after the last coach reply
  lastReply: LiveMsg | null; // last coach/sender-bot message
  lastCreator: LiveMsg | null;
  answered: boolean;         // coach replied after the creator's last message
}

const isReply = (m: LiveMsg) => Boolean(m.self || m.staff);
const isCreator = (m: LiveMsg) => !m.bot && !m.staff;

export function threadState(msgs: LiveMsg[] = []): ThreadState {
  let lastReplyIdx = -1;
  msgs.forEach((m, i) => { if (isReply(m)) lastReplyIdx = i; });
  const creatorMsgs = msgs.filter(isCreator);
  const lastCreator = creatorMsgs.at(-1) ?? null;
  const lastReply = lastReplyIdx >= 0 ? msgs[lastReplyIdx] : null;
  const unanswered = msgs.slice(lastReplyIdx + 1).filter(isCreator);
  return {
    unanswered,
    lastReply,
    lastCreator,
    answered: Boolean(lastReply && (!lastCreator || lastReply.ts > lastCreator.ts)),
  };
}

// Staff = anyone in COACH_DISCORD_IDS, or anyone (non-bot) who posts in 3+ creator channels.
// Creators only post in their own channel, so this picks out Christian + other coaches automatically.
export function markStaff(live: Live, coachIds: string[]): Live {
  const seen = new Map<string, Set<string>>();
  for (const [ch, msgs] of Object.entries(live.channels)) {
    for (const m of msgs) {
      if (m.bot) continue;
      if (!seen.has(m.authorId)) seen.set(m.authorId, new Set());
      seen.get(m.authorId)!.add(ch);
    }
  }
  const staff = new Set(coachIds);
  for (const [id, chs] of Array.from(seen)) if (chs.size >= 3) staff.add(id);
  const channels: Live["channels"] = {};
  for (const [ch, msgs] of Object.entries(live.channels)) {
    channels[ch] = msgs.map((m) => ({ ...m, staff: !m.bot && staff.has(m.authorId) }));
  }
  return { ...live, channels };
}
