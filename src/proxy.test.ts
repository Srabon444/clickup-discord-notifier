import { beforeEach, describe, expect, test } from "vitest";
import type { NextRequest } from "next/server";
import { proxy } from "./proxy";
import { createSessionToken } from "./lib/session";

function requestWithCookie(token?: string) {
  return {
    cookies: {
      get: (name: string) => (name === "dashboard_session" && token !== undefined ? { value: token } : undefined),
    },
    nextUrl: new URL("http://localhost/dashboard"),
    url: "http://localhost/dashboard",
  } as unknown as NextRequest;
}

beforeEach(() => {
  process.env.DASHBOARD_PASSWORD = "secret";
});

describe("proxy (dashboard session cookie)", () => {
  test("passes through with a valid session cookie", async () => {
    const token = await createSessionToken("secret");
    const res = await proxy(requestWithCookie(token));
    expect(res.status).toBe(200);
  });

  test("redirects to login when the cookie is missing", async () => {
    const res = await proxy(requestWithCookie());
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/?redirect=");
  });

  test("redirects to login when the cookie is invalid", async () => {
    const res = await proxy(requestWithCookie("garbage"));
    expect(res.status).toBe(307);
  });

  test("redirects to login when the cookie was signed with a different secret", async () => {
    const token = await createSessionToken("wrong-secret");
    const res = await proxy(requestWithCookie(token));
    expect(res.status).toBe(307);
  });
});
