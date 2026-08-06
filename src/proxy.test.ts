import { beforeEach, describe, expect, test } from "vitest";
import { proxy } from "./proxy";

function requestWithAuth(user?: string, pass?: string) {
  const headers = new Headers();
  if (user !== undefined && pass !== undefined) {
    headers.set("authorization", `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`);
  }
  return { headers } as never;
}

beforeEach(() => {
  process.env.DASHBOARD_USERNAME = "admin";
  process.env.DASHBOARD_PASSWORD = "secret";
});

describe("proxy (dashboard Basic Auth)", () => {
  test("passes through with correct credentials", () => {
    const res = proxy(requestWithAuth("admin", "secret"));
    expect(res.status).not.toBe(401);
  });

  test("rejects wrong credentials", () => {
    const res = proxy(requestWithAuth("admin", "wrong"));
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("Basic");
  });

  test("rejects a missing Authorization header", () => {
    const res = proxy(requestWithAuth());
    expect(res.status).toBe(401);
  });

  test("rejects a password that is a prefix of the real one, no truncation bug", () => {
    const res = proxy(requestWithAuth("admin", "secre"));
    expect(res.status).toBe(401);
  });
});
