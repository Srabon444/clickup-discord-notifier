"use client";

export function LogoutButton() {
  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/";
  };

  return (
    <button
      onClick={handleLogout}
      style={{
        padding: "0.4rem 0.9rem",
        backgroundColor: "transparent",
        color: "#8b949e",
        border: "1px solid #30363d",
        borderRadius: "4px",
        cursor: "pointer",
        fontSize: "0.85rem",
      }}
    >
      Log out
    </button>
  );
}
