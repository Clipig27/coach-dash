"use client";
import { useEffect, useMemo, useState } from "react";
import type { Draft, Tab } from "@/lib/types";

const TABS: { key: Tab; label: string }[] = [
  { key: "respond_now", label: "Respond now" },
  { key: "needs_you_first", label: "Needs you first" },
  { key: "missed_yesterday", label: "Missed yesterday" },
  { key: "at_risk", label: "At risk" },
];

export default function Queue() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [tab, setTab] = useState<Tab>("respond_now");
  const [date, setDate] = useState("");
  const [bulkText, setBulkText] = useState(
    "hey what posts u getting out today? also OH is today from 8-9PM EST can u come?"
  );
  const [bulkPicks, setBulkPicks] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/drafts");
    const body = await res.json();
    setDrafts(body.drafts);
    setDate(body.date);
  }
  useEffect(() => {
    load();
  }, []);

  const inTab = useMemo(() => drafts.filter((d) => d.tab === tab), [drafts, tab]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of TABS) c[t.key] = drafts.filter((d) => d.tab === t.key && !d.approved).length;
    return c;
  }, [drafts]);

  function edit(id: string, text: string) {
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
        <span className="status">{date}</span>
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

      {inTab.map((d) => (
        <div className="card" key={d.id}>
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
          <div className="summary">{d.summary}</div>
          <textarea
            value={d.draft}
            onChange={(e) => edit(d.id, e.target.value)}
            onBlur={() => saveEdit(d)}
            disabled={d.approved}
          />
          <div className="row">
            <button className="approve" onClick={() => approve(d)} disabled={d.approved || busy === d.id || d.flags.includes("pay_question")}>
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
      ))}
    </div>
  );
}
