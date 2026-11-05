import { getRanking, getLP, today } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function Rankings() {
  const date = today();
  let rows = getRanking(date);

  // Fallback: compute a simple ranking from LP data if no ranking CSV for today.
  if (!rows.length) {
    const lp = getLP(date);
    const maxViews = Math.max(1, ...lp.map((c) => c.views));
    rows = lp.map((c) => {
      const posts = c.posts_last7d_daily.reduce((a, b) => a + b, 0);
      const daysPosted = c.posts_last7d_daily.filter((n) => n > 0).length;
      return {
        creator: c.creator,
        effort: Math.round((daysPosted / 7) * 100),
        output: Math.round((c.views / maxViews) * 100),
        views: c.views,
        posts,
      };
    });
  }

  const byEffort = [...rows].sort((a, b) => b.effort - a.effort);
  const byOutput = [...rows].sort((a, b) => b.output - a.output);
  const totalViews = rows.reduce((a, r) => a + r.views, 0);

  return (
    <div>
      <h2>Rankings, {date}</h2>
      <p className="muted">Cohort views this period: {totalViews.toLocaleString()}</p>

      <h2>Effort (posting consistency)</h2>
      <table>
        <thead><tr><th>#</th><th>Creator</th><th>Effort</th><th>Posts 7d</th></tr></thead>
        <tbody>
          {byEffort.map((r, i) => (
            <tr key={r.creator}><td>{i + 1}</td><td>{r.creator}</td><td>{r.effort}</td><td>{r.posts}</td></tr>
          ))}
        </tbody>
      </table>

      <h2>Output (views)</h2>
      <table>
        <thead><tr><th>#</th><th>Creator</th><th>Output</th><th>Views</th></tr></thead>
        <tbody>
          {byOutput.map((r, i) => (
            <tr key={r.creator}><td>{i + 1}</td><td>{r.creator}</td><td>{r.output}</td><td>{r.views.toLocaleString()}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
