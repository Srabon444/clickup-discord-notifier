"use client";

import { useState, type CSSProperties } from "react";

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "0.6rem",
  backgroundColor: "#0d1117",
  border: "1px solid #30363d",
  borderRadius: "4px",
  color: "white",
  fontSize: "0.95rem",
  boxSizing: "border-box",
};

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        setError("Invalid username or password");
        return;
      }
      window.location.href = redirectTo;
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0d1117",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          backgroundColor: "#161b22",
          padding: "2.5rem",
          borderRadius: "8px",
          width: "320px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        }}
      >
        <h1 style={{ color: "white", fontSize: "1.5rem", marginBottom: "0.25rem" }}>🎫 Captain Ticket</h1>
        <p style={{ color: "#8b949e", marginBottom: "1.5rem", fontSize: "0.9rem" }}>Sign in to view the dashboard</p>

        <label style={{ display: "block", color: "#c9d1d9", fontSize: "0.85rem", marginBottom: "0.35rem" }}>
          Username
        </label>
        <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required style={inputStyle} />

        <label style={{ display: "block", color: "#c9d1d9", fontSize: "0.85rem", margin: "1rem 0 0.35rem" }}>
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={inputStyle}
        />

        {error && <p style={{ color: "#ff6b6b", fontSize: "0.85rem", marginTop: "0.75rem" }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            marginTop: "1.5rem",
            padding: "0.65rem",
            backgroundColor: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
            fontSize: "0.95rem",
          }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
