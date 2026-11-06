import { getDrafts, saveDrafts } from "./store";

// Mirror send results onto the draft cards so the queue UI shows sent / failed.
export async function syncDrafts(changed: { draftId?: string; date?: string; status: string; sentAt?: string; error?: string }[]) {
  const byDate = new Map<string, typeof changed>();
  for (const c of changed) {
    if (!c.draftId || !c.date) continue;
    byDate.set(c.date, [...(byDate.get(c.date) ?? []), c]);
  }
  for (const [date, list] of Array.from(byDate)) {
    const drafts = await getDrafts(date);
    for (const c of list) {
      const d = drafts.find((x) => x.id === c.draftId);
      if (!d) continue;
      if (c.status === "sent") {
        d.sent = true;
        d.sentAt = c.sentAt;
        d.sendError = undefined;
      } else if (c.status === "failed") {
        d.sent = false;
        d.sendError = c.error ?? "send failed";
      }
    }
    await saveDrafts(drafts, date);
  }
}
