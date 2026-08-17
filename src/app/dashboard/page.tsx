import { supabaseServer } from "@/lib/supabase-server";
import { LogoutButton } from "./logout-button";
import { TriggerButtons } from "./trigger-buttons";

type EventRow = {
  id: string;
  event_type: string;
  task_id: string;
  task_name: string | null;
  discord_status: string;
  error_message: string | null;
  raw_payload: unknown;
  created_at: string;
};

const EVENT_TYPES = ["taskCommentPosted", "taskAssigneeUpdated", "taskStatusUpdated"];

function formatDhakaTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "Asia/Dhaka",
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ event_type?: string }>;
}) {
  const { event_type } = await searchParams;

  let query = supabaseServer
    .from("events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (event_type) {
    query = query.eq("event_type", event_type);
  }

  const { data, error } = await query;
  const rows = (data ?? []) as EventRow[];

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>ClickUp → Discord notification log</h1>
        <LogoutButton />
      </div>

      <TriggerButtons />

      <form method="get" style={{ margin: "1rem 0" }}>
        <label>
          Event type:{" "}
          <select name="event_type" defaultValue={event_type ?? ""}>
            <option value="">All</option>
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>{" "}
        <button type="submit">Filter</button>
      </form>

      {error && <p style={{ color: "red" }}>Failed to load events: {error.message}</p>}

      <table border={1} cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th>Time</th>
            <th>Event</th>
            <th>Task</th>
            <th>Status</th>
            <th>Raw payload</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{formatDhakaTime(row.created_at)}</td>
              <td>{row.event_type}</td>
              <td>{row.task_name ?? row.task_id}</td>
              <td style={{ color: row.discord_status === "success" ? "green" : "crimson" }}>
                {row.discord_status}
                {row.error_message ? ` — ${row.error_message}` : ""}
              </td>
              <td>
                <details>
                  <summary>view</summary>
                  <pre style={{ maxWidth: "400px", overflow: "auto" }}>
                    {JSON.stringify(row.raw_payload, null, 2)}
                  </pre>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 && !error && <p>No events yet.</p>}
    </main>
  );
}
