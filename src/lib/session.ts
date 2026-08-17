const encoder = new TextEncoder();
const SESSION_PAYLOAD = "dashboard-authenticated";

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

//! Reuses DASHBOARD_PASSWORD as the HMAC secret instead of a separate
//! session-secret env var — same lightweight-gate tradeoff the old Basic
//! Auth already made (see proxy.ts), just swapped to a cookie so the browser
//! stops popping its native credential dialog on every page load.
export async function createSessionToken(secret: string): Promise<string> {
  const key = await getKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(SESSION_PAYLOAD));
  return toHex(signature);
}

export async function verifySessionToken(token: string, secret: string): Promise<boolean> {
  const expected = await createSessionToken(secret);
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
