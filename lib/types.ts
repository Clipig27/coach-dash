// Shared types matching Christian's existing bot artifact shapes.

export type Tab = "respond_now" | "needs_you_first" | "missed_yesterday" | "at_risk";

export interface Draft {
  id: string;              // stable id: `${date}:${creator}` or uuid
  date: string;            // YYYY-MM-DD
  creator: string;         // roster display name
  channel: string;         // discord channel name (e.g. "nicole-matto")
  channelId?: string;      // discord channel id when known
  trigger: string;         // why this draft exists ("no reply 14h", "missed posts", ...)
  summary: string;         // short chat summary shown on the card
  draft: string;           // editable message text
  flags: string[];         // e.g. ["pay_question"] -> never auto-draft, route to coach
  tab: Tab;
  approved: boolean;
  sent: boolean;
  approvedText?: string;   // exact text approved (post-edit)
  approvedAt?: string;
  sentAt?: string;
  ingestedAt?: string;     // when Grok Bot uploaded it; live msgs after this = draft may be stale
}

export interface CreatorLP {
  creator: string;
  views: number;
  posts_last7d_daily: number[]; // oldest -> newest, length 7
  cpm: number;
  eng: number;
  fraud_flags: number;
}

export interface Goals {
  [creator: string]: {
    posts_per_day?: number;
    quote?: string;         // their own words
    views_goal?: string;
    other?: string[];
  };
}

export interface ApprovedSend {
  id: string;
  channel: string;
  channelId?: string;
  text: string;
  approvedAt: string;
  sent: boolean;
  sentAt?: string;
}

export interface RankingRow {
  creator: string;
  effort: number;   // 0-100: posting consistency + comms + goals engagement
  output: number;   // 0-100: views/eng/cpm blend
  views: number;
  posts: number;
}
