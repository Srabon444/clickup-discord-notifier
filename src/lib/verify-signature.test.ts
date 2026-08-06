import crypto from "node:crypto";
import { describe, expect, test } from "vitest";
import { verifyClickupSignature } from "./verify-signature";

const secret = "test-secret";
const rawBody = '{"webhook_id":"abc","event":"taskCreated","task_id":"c0j"}';
const validSignature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

describe("verifyClickupSignature", () => {
  test("passes with a valid signature", () => {
    expect(verifyClickupSignature(rawBody, validSignature, secret)).toBe(true);
  });

  test("fails when the body is tampered with", () => {
    const tamperedBody = rawBody.replace("taskCreated", "taskDeleted");
    expect(verifyClickupSignature(tamperedBody, validSignature, secret)).toBe(false);
  });

  test("fails when the signature is tampered with", () => {
    const tamperedSignature = validSignature.slice(0, -1) + (validSignature.endsWith("0") ? "1" : "0");
    expect(verifyClickupSignature(rawBody, tamperedSignature, secret)).toBe(false);
  });

  test("fails when no signature header is present", () => {
    expect(verifyClickupSignature(rawBody, null, secret)).toBe(false);
  });
});
