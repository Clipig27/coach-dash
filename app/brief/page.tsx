import { getLP, getTopVideos, getRoster, today } from "@/lib/store";
import CopyBrief from "./copy";

export const dynamic = "force-dynamic";

// Coach-editable notes for the day. Edit here (or wire to KV later).
// RULE: no $ rates or pay numbers in creator-facing copy. Pay notes stay coach-only.
const NOTES = [
  "Omega is optional. Push AI Pixar skits, GTA VI clipping, AI explainers",
  "Higgsfield Jester is cancelled, do not post it",
  "OH tonight 8-9PM EST, pull up",
];

export default function Brief() {
  const date = today();
  const lp = getLP(date);
  const roster = getRoster();
  const top = getTopVideos(date).slice(0, 5);

  const postedYesterday = new Set(
    lp.filter((c) => (c.posts_last7d_daily.at(-1) ?? 0) > 0).map((c) => c.creator)
  );
  const missed = roster.map((r) => r.creator).filter((c) => !postedYesterday.has(c));
  const topCreators = [...lp].sort((a, b) => b.views - a.views).slice(0, 5);

  const briefText = [
    `DAILY BRIEF ${date}`,
    ``,
    `MISSED YESTERDAY (0 posts):`,
    ...(missed.length ? missed.map((m) => `- ${m}`) : ["- nobody, full board 🎉"]),
    ``,
    `TOP CREATORS YESTERDAY:`,
    ...topCreators.map((c) => `- ${c.creator}: ${c.views.toLocaleString()} views`),
    ``,
    `TOP VIRAL VIDEOS:`,
    ...top.map((v) => `- ${v.creator} (${v.views.toLocaleString()}): ${v.link}`),
    ``,
    `NOTES:`,
    ...NOTES.map((n) => `- ${n}`),
  ].join("\n");

  return (
    <div className="brief">
      <h2>Daily Brief, {date}</h2>
      <CopyBrief text={briefText} />
      <pre>{briefText}</pre>
      <p className="muted">
        Reminder: pay rates never go in creator-facing copy. This page only renders
        from data/lp and the NOTES list in app/brief/page.tsx.
      </p>
    </div>
  );
}
