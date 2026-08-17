import nacl from "tweetnacl";
import { describe, expect, test } from "vitest";
import { verifyDiscordSignature } from "./discord-verify";

const keyPair = nacl.sign.keyPair();
const publicKeyHex = Buffer.from(keyPair.publicKey).toString("hex");

function sign(timestamp: string, body: string): string {
  const signature = nacl.sign.detached(Buffer.from(timestamp + body), keyPair.secretKey);
  return Buffer.from(signature).toString("hex");
}

describe("verifyDiscordSignature", () => {
  test("accepts a correctly signed request", () => {
    const timestamp = "1700000000";
    const body = JSON.stringify({ type: 1 });
    expect(verifyDiscordSignature(body, sign(timestamp, body), timestamp, publicKeyHex)).toBe(true);
  });

  test("rejects a tampered body", () => {
    const timestamp = "1700000000";
    const signature = sign(timestamp, JSON.stringify({ type: 1 }));
    expect(verifyDiscordSignature(JSON.stringify({ type: 2 }), signature, timestamp, publicKeyHex)).toBe(false);
  });

  test("rejects a tampered timestamp", () => {
    const timestamp = "1700000000";
    const body = JSON.stringify({ type: 1 });
    const signature = sign(timestamp, body);
    expect(verifyDiscordSignature(body, signature, "1700000001", publicKeyHex)).toBe(false);
  });

  test("rejects missing signature or timestamp", () => {
    expect(verifyDiscordSignature("{}", null, "123", publicKeyHex)).toBe(false);
    expect(verifyDiscordSignature("{}", "abc", null, publicKeyHex)).toBe(false);
  });

  test("rejects a malformed signature without throwing", () => {
    expect(verifyDiscordSignature("{}", "not-hex-zz", "123", publicKeyHex)).toBe(false);
  });
});
