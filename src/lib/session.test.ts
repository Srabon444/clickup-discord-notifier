import { describe, expect, test } from "vitest";
import { createSessionToken, verifySessionToken } from "./session";

describe("session token", () => {
  test("verifies a token created with the same secret", async () => {
    const token = await createSessionToken("secret");
    expect(await verifySessionToken(token, "secret")).toBe(true);
  });

  test("rejects a token created with a different secret", async () => {
    const token = await createSessionToken("secret");
    expect(await verifySessionToken(token, "other")).toBe(false);
  });

  test("rejects garbage input", async () => {
    expect(await verifySessionToken("not-a-real-token", "secret")).toBe(false);
  });
});
