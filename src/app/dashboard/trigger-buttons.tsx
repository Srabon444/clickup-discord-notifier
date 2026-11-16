"use client";

import { useState } from "react";

export function TriggerButtons() {
  const [loading, setLoading] = useState<"next" | "current" | "prev" | "backup" | null>(null);
  const [backupResult, setBackupResult] = useState<{ ok: boolean; message: string } | null>(null);
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

  const triggerBackup = async () => {
    setLoading("backup");
    setBackupResult(null);
    try {
      const res = await fetch("/api/backup-trigger", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 202) {
        setBackupResult({ ok: true, message: "Backup started. The Discord link arrives in 1-2 minutes." });
      } else if (res.status === 409) {
        setBackupResult({ ok: false, message: "A backup is already running." });
      } else if (res.status === 429) {
        const minutes = Math.ceil((Number(data.retryAfterSec) || 60) / 60);
        setBackupResult({ ok: false, message: `Cooldown active. Try again in ${minutes} min.` });
      } else {
        setBackupResult({ ok: false, message: `Failed: ${data.error ?? res.status}` });
      }
    } catch (error) {
      setBackupResult({ ok: false, message: `Failed: ${error instanceof Error ? error.message : "Unknown error"}` });
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
        <button
          onClick={triggerBackup}
          disabled={loading !== null}
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.5rem 1rem",
            backgroundColor: loading === "backup" ? "#a71d2a" : "#dc3545",
            color: "white",
            border: "none",
            cursor: loading === "backup" ? "not-allowed" : "pointer",
            opacity: loading === "backup" ? 0.6 : 1,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <ellipse cx="12" cy="5" rx="8" ry="3" />
            <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
            <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
          </svg>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
          {loading === "backup" ? "Starting..." : "Backup & Notify"}
        </button>
      </div>
      {backupResult && (
        <div style={{ marginTop: "1rem", color: backupResult.ok ? "#51cf66" : "#ff6b6b" }}>
          <strong>Backup:</strong> {backupResult.message}
        </div>
      )}
      {result && (
        <div style={{ marginTop: "1rem", color: result.message.includes("Error") ? "#ff6b6b" : "#51cf66" }}>
          <strong>{result.direction === "next" ? "Next" : result.direction === "current" ? "Current" : "Prev"} week:</strong> {result.message}
          {result.membersShown > 0 && ` (${result.membersShown} members, ${result.membersWithGap} with gaps)`}
        </div>
      )}
    </div>
  );
}
