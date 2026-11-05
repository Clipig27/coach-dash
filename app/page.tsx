"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Draft, Tab } from "@/lib/types";
import { threadState, type Live, type LiveMsg } from "@/lib/thread";
import { PAY, PLACEHOLDER } from "@/lib/rules";

const TABS: { key: Tab; label: string }[] = [
  { key: "respond_now", label: "Respond now" },
  { key: "needs_you_first", label: "Needs you first" },
  { key: "missed_yesterday", label: "Missed yesterday" },
  { key: "at_risk", label: "At risk" },
];

function fmtTime(ts: string): string {
  const d = new Date(ts);
  const opts = { timeZone: "America/New_York" } as const;
  const day = d.toLocaleDateString("en-US", { ...opts, month: "short", day: "numeric" });
  const today = new Date().toLocaleDateString("en-US", { ...opts, month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { ...opts, hour: "numeric", minute: "2-digit" });
  return day === today ? time : `${day} ${time}`;
}

function ago(ts: string | null): string {
  if (!ts) return "never";
  const s = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
  return s < 90 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
}

function MsgBody({ m }: { m: LiveMsg }) {
  const vids = m.attachments.filter((a) => a.type.startsWith("video")).length;
  const imgs = m.attachments.filter((a) => a.type.startsWith("image")).length;
  const other = m.attachments.length - vids - imgs;
  const files = [vids && `🎬 ${vids} video${vids > 1 ? "s" : ""}`, imgs && `🖼 ${imgs} image${imgs > 1 ? "s" : ""}`, other && `📎 ${other} file${other > 1 ? "s" : ""}`].filter(Boolean);
  return (
    <>
      {m.content && <span className="text">{m.content}</span>}
      {files.length > 0 && <span className="files">{files.join(" · ")}</span>}
      {!m.content && !files.length && <span className="muted">(no text, check Message Content Intent)</span>}
    </>
  );
}

export default function Queue() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [tab, setTab] = useState<Tab>("respond_now");
  const [date, setDate] = useState("");
  const [bulkText, setBulkText] = useState(
    "hey what posts u getting out today? also OH is today from 8-9PM EST can u come?"
  );
  const [bulkPicks, setBulkPicks] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [live, setLive] = useState<Live>({ updatedAt: null, channels: {} });
  const [, setTick] = useState(0);
  // drafts I've typed in but not approved; a background refresh must never overwrite them
  const dirty = useRef<Set<string>>(new Set());

  async function load() {
    const res = await fetch("/api/drafts");
    if (!res.ok) return;
    const body = await res.json();
    setDrafts((prev) => {
      const local = new Map(prev.map((d) => [d.id, d]));
      return body.drafts.map((d: Draft) => (dirty.current.has(d.id) && local.has(d.id) ? { ...d, draft: local.get(d.id)!.draft } : d));
    });
    setDate(body.date);
  }

  async function loadLive() {
    const res = await fetch("/api/live");
    if (res.ok) setLive(await res.json());
  }

  useEffect(() => {
    load();
    loadLive();
    const a = setInterval(loadLive, 20_000);
    const b = setInterval(load, 60_000);
    const c = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => [a, b, c].forEach(clearInterval);
  }, []);

  const threads = useMemo(() => {
    const m = new Map<string, ReturnType<typeof threadState>>();
    for (const d of drafts) m.set(d.channel, threadState(live.channels[d.channel]));
    return m;
  }, [drafts, live]);

  const done = (d: Draft) => d.approved || Boolean(threads.get(d.channel)?.answered);
  // answered/approved cards sink to the bottom, sidebar order otherwise
  const inTab = useMemo(
    () => drafts.filter((d) => d.tab === tab).sort((a, b) => Number(done(a)) - Number(done(b))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drafts, tab, threads]
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of TABS) c[t.key] = drafts.filter((d) => d.tab === t.key && !done(d)).length;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, threads]);

  function edit(id: string, text: string) {
    dirty.current.add(id);
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, draft: text } : d)));
  }

  async function saveEdit(d: Draft) {
    await fetch("/api/drafts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: d.id, draft: d.draft }),
    });
  }

  async function approve(d: Draft) {
    setBusy(d.id);
    const res = await fetch("/api/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: d.id, text: d.draft }),
    });
    setBusy(null);
    if (res.ok) {
      dirty.current.delete(d.id);
      setDrafts((ds) =>
        ds.map((x) => (x.id === d.id ? { ...x, approved: true, approvedText: d.draft } : x))
      );
    } else {
      alert((await res.json()).error ?? "approve failed");
    }
  }

  async function skip(d: Draft) {
    setDrafts((ds) => ds.filter((x) => x.id !== d.id));
    await fetch("/api/drafts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: d.id, tab: "skipped" }),
    });
  }

  function togglePick(ch: string) {
    setBulkPicks((p) => {
      const n = new Set(p);
      n.has(ch) ? n.delete(ch) : n.add(ch);
      return n;
    });
  }

  async function bulkApprove() {
    const channels = Array.from(bulkPicks);
    if (!channels.length || !bulkText.trim()) return;
    if (!confirm(`Send to ${channels.length} channels?\n\n"${bulkText}"\n\n${channels.join(", ")}`)) return;
    const res = await fetch("/api/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channels, text: bulkText }),
    });
    const body = await res.json();
    alert(res.ok ? `Queued ${body.queued} sends${body.blocked?.length ? `, blocked: ${body.blocked.join(", ")}` : ""}` : body.error);
    if (res.ok) setBulkPicks(new Set());
  }

  // bulk candidates: everyone in today's drafts (Discord-ordered already from API)
  const channels = useMemo(() => Array.from(new Set(drafts.map((d) => d.channel))), [drafts]);

  return (
    <div>
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
            <span className="count">{counts[t.key] ?? 0}</span>
          </button>
        ))}
        <span className="status">
          {date} · Discord synced {ago(live.updatedAt)}
        </span>
      </div>

      <div className="bulkbar">
        <strong>Bulk message</strong>
        <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} />
        <div className="picks">
          {channels.map((ch) => (
            <span key={ch} className={`pick ${bulkPicks.has(ch) ? "on" : ""}`} onClick={() => togglePick(ch)}>
              {ch}
            </span>
          ))}
        </div>
        <button className="bulk" onClick={bulkApprove} disabled={!bulkPicks.size}>
          Approve to {bulkPicks.size} channels
        </button>
      </div>

      {inTab.length === 0 && <p className="muted">Nothing in this tab. 🎉</p>}

      {inTab.map((d) => {
        const t = threads.get(d.channel)!;
        const msgs = (live.channels[d.channel] ?? []).slice(-6);
        const stale = Boolean(d.ingestedAt && t.lastCreator && t.lastCreator.ts > d.ingestedAt && !t.answered);
        const payLive = t.unanswered.some((m) => PAY.test(m.content));
        const placeholder = PLACEHOLDER.test(d.draft);
        const blocked = d.flags.includes("pay_question") || payLive || placeholder;
        return (
          <div className={`card ${done(d) ? "done" : ""}`} key={d.id}>
            <div className="head">
              <div>
                <span className="name">{d.creator}</span>{" "}
                <span className="channel">#{d.channel}</span>
                {d.flags.map((f) => (
                  <span className="flag" key={f}>
                    {f === "pay_question" ? "💰 pay question, answer yourself" : f}
                  </span>
                ))}
              </div>
              <span className="muted" style={{ fontSize: 12 }}>{d.trigger}</span>
            </div>
            {d.summary && <div className="summary">{d.summary}</div>}

            <div className="label">In Discord</div>
            <div className="thread">
              {msgs.length === 0 && <div className="muted">waiting for Discord sync…</div>}
              {msgs.map((m) => {
                const mine = m.self || m.staff;
                const open = t.unanswered.some((u) => u.id === m.id);
                return (
                  <div className={`msg ${mine ? "mine" : ""} ${open ? "open" : ""}`} key={m.id}>
                    <span className="who">{m.self ? "you (via bot)" : m.author}</span>
                    <span className="time">{fmtTime(m.ts)}</span>
                    <div className="body"><MsgBody m={m} /></div>
                  </div>
                );
              })}
            </div>

            {t.answered && !d.approved && t.lastReply && (
              <div className="note ok">✓ already replied in Discord at {fmtTime(t.lastReply.ts)}</div>
            )}
            {stale && <div className="note warn">🆕 new message after this draft was written, check it still fits</div>}
            {payLive && <div className="note bad">💰 their latest message mentions pay, answer it yourself</div>}

            <div className="label">Your reply</div>
            <textarea
              value={d.draft}
              onChange={(e) => edit(d.id, e.target.value)}
              onBlur={() => saveEdit(d)}
              disabled={d.approved}
            />
            {placeholder && <div className="note warn">fill in the [brackets] before approving</div>}
            <div className="row">
              <button className="approve" onClick={() => approve(d)} disabled={d.approved || busy === d.id || blocked}>
                {d.approved ? "Approved ✓" : "Approve"}
              </button>
              {!d.approved && (
                <button className="skip" onClick={() => skip(d)}>
                  Skip
                </button>
              )}
              {d.approved && <span className="status ok">queued for send</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
