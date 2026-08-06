import crypto from "node:crypto";

//! ClickUp signs the raw (unparsed) request body with HMAC-SHA256 and sends
//! the hex digest in X-Signature. Verify against the raw string, not a
//! re-serialized JSON.parse(body) — re-serializing can change whitespace and
//! break the comparison.
export function verifyClickupSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signatureHeader);

  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
