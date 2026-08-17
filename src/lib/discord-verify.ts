import nacl from "tweetnacl";

//! Discord's own recommended verification (Ed25519 over timestamp+body) —
//! reject on any malformed input rather than throwing, so the route can
//! treat "not verified" uniformly as a 401.
export function verifyDiscordSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  publicKey: string
): boolean {
  if (!signature || !timestamp) return false;
  try {
    return nacl.sign.detached.verify(
      Buffer.from(timestamp + rawBody),
      Buffer.from(signature, "hex"),
      Buffer.from(publicKey, "hex")
    );
  } catch {
    return false;
  }
}
