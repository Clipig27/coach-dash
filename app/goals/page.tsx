import { getGoals, getLP, getRoster, getChannelOrder, today } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function GoalsPage() {
  const goals = getGoals();
  const lp = getLP(today());
  const roster = getRoster();
  const order = getChannelOrder();
  const orderIdx = new Map(order.map((c, i) => [c, i]));

  const rows = roster
    .map((r) => {
      const g = goals[r.creator];
      const stats = lp.find((c) => c.creator === r.creator);
      const postedYesterday = stats?.posts_last7d_daily.at(-1) ?? 0;
      const target = g?.posts_per_day ?? null;
      const status: "no_goals" | "behind" | "on_track" =
        !g ? "no_goals" : target !== null && postedYesterday < target ? "behind" : "on_track";
      return { ...r, goal: g, postedYesterday, target, status };
    })
    .sort((a, b) => (orderIdx.get(a.channel) ?? 999) - (orderIdx.get(b.channel) ?? 999));

  const noGoals = rows.filter((r) => r.status === "no_goals");

  return (
    <div>
      <h2>Goals Accountability</h2>
      <p className="muted">
        Order = Discord sidebar. Behind = yesterday's posts below their own stated posts/day.
      </p>
      {noGoals.length > 0 && (
        <p>
          <strong>{noGoals.length} creators have no goals on file.</strong>{" "}
          Queue the "ask for 3 goals" message (posts/day, views or CPM, OH/check-ins) for:{" "}
          {noGoals.map((r) => r.creator).join(", ")}
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th>Creator</th>
            <th>Their goal</th>
            <th>Posted yesterday</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.creator}>
              <td>{r.creator}</td>
              <td className="muted">
                {r.goal
                  ? r.goal.quote ?? `${r.goal.posts_per_day ?? "?"}/day`
                  : "none on file"}
              </td>
              <td>{r.postedYesterday}{r.target !== null ? ` / ${r.target}` : ""}</td>
              <td>
                {r.status === "no_goals" && <span className="pill">ask for goals</span>}
                {r.status === "behind" && <span className="pill red">behind own goal</span>}
                {r.status === "on_track" && <span className="pill green">on track</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
