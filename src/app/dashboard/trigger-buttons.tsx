"use client";

import { useState } from "react";

export function TriggerButtons() {
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
    <div style={{ margin: "1rem 0" }}>
      <h3 style={{ color: "white" }}>Trigger Coverage Notification</h3>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {(["next", "current", "prev"] as const).map((dir) => (
          <button
            key={dir}
            onClick={() => trigger(dir)}
            disabled={loading !== null}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: loading === dir ? "#0056b3" : "#007bff",
              color: "white",
              border: "none",
              cursor: loading === dir ? "not-allowed" : "pointer",
              opacity: loading === dir ? 0.6 : 1,
            }}
          >
            {loading === dir ? "Posting..." : `${dir === "next" ? "Next" : dir === "current" ? "Current" : "Prev"} Week`}
          </button>
        ))}
      </div>
      {result && (
        <div style={{ marginTop: "1rem", color: result.message.includes("Error") ? "#ff6b6b" : "#51cf66" }}>
          <strong>{result.direction === "next" ? "Next" : result.direction === "current" ? "Current" : "Prev"} week:</strong> {result.message}
          {result.membersShown > 0 && ` (${result.membersShown} members, ${result.membersWithGap} with gaps)`}
        </div>
      )}
    </div>
  );
}
