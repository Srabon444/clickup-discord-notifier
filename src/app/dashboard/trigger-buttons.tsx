"use client";

import { useState } from "react";

export function TriggerButtons() {
  const [loading, setLoading] = useState<"next" | "current" | "prev" | null>(null);
  //? Not persisted on purpose — a remembered checkbox would quietly post the
  //? other report on the next page load.
  const [includeParent, setIncludeParent] = useState(false);
  const [result, setResult] = useState<{ direction: string; message: string; membersShown: number; membersWithGap: number } | null>(null);

  const trigger = async (direction: "next" | "current" | "prev") => {
    setLoading(direction);
    setResult(null);
    try {
      const res = await fetch("/api/trigger-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction, includeParent }),
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
      <label style={{ color: "white", display: "inline-flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.75rem" }}>
        <input
          type="checkbox"
          checked={includeParent}
          onChange={(e) => setIncludeParent(e.target.checked)}
          disabled={loading !== null}
        />
        Include parent
        <span style={{ opacity: 0.6, fontSize: "0.85em" }}>
          (off: a ticket with subtasks doesn&apos;t count for whoever is assigned to the parent)
        </span>
      </label>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {(["prev", "current", "next"] as const).map((dir) => (
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
