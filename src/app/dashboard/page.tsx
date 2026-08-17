"use client";

import { useState } from "react";
import { supabaseServer } from "@/lib/supabase-server";

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

//! This is a server-rendered page — Date#toLocaleString() without a
//! timeZone runs in Vercel's server timezone (UTC), not the viewer's browser
//! timezone. The team is Bangladesh-based, so format explicitly in Asia/Dhaka
//! instead of silently showing UTC times that don't match anyone's clock.
function formatDhakaTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "Asia/Dhaka",
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

function TriggerButtons({ rows }: { rows: EventRow[] }) {
  const [loading, setLoading] = useState<"next" | "current" | "prev" | null>(null);
  const [result, setResult] = useState<{ direction: string; message: string; membersShown: number; membersWithGap: number } | null>(null);

  const trigger = async (direction: "next" | "current" | "prev") => {
    setLoading(direction);
    setResult(null);
    try {
      const res = await fetch("/api/trigger-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      const data = await res.json();
      setResult({ direction, ...data });
    } catch (error) {
      setResult({ direction, message: `Error: ${error instanceof Error ? error.message : "Unknown error"}`, membersShown: 0, membersWithGap: 0 });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div style={{ margin: "1rem 0", padding: "1rem", backgroundColor: "#f5f5f5", borderRadius: "4px" }}>
      <h3>Trigger Coverage Notification</h3>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {(["next", "current", "prev"] as const).map((dir) => (
          <button
            key={dir}
            onClick={() => trigger(dir)}
            disabled={loading !== null}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: loading === dir ? "#ccc" : "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: loading === dir ? "not-allowed" : "pointer",
              opacity: loading === dir ? 0.6 : 1,
            }}
          >
            {loading === dir ? "Posting..." : `${dir === "next" ? "Next" : dir === "current" ? "Current" : "Prev"} Week`}
          </button>
        ))}
      </div>
      {result && (
        <div style={{ marginTop: "1rem", padding: "0.75rem", backgroundColor: result.message.includes("Error") ? "#ffe0e0" : "#e0ffe0", borderRadius: "4px" }}>
          <strong>{result.direction === "next" ? "Next" : result.direction === "current" ? "Current" : "Prev"} week:</strong> {result.message}
          {result.membersShown > 0 && ` (${result.membersShown} members, ${result.membersWithGap} with gaps)`}
        </div>
      )}
    </div>
  );
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
      <h1>ClickUp → Discord notification log</h1>

      <TriggerButtons rows={rows} />

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
