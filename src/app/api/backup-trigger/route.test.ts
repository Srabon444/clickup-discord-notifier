import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { NextRequest } from "next/server";
import { GET, POST } from "./route";
import { createSessionToken } from "@/lib/session";

function requestWithCookie(token?: string) {
  return {
    cookies: {
      get: (name: string) => (name === "dashboard_session" && token !== undefined ? { value: token } : undefined),
    },
  } as unknown as NextRequest;
}

const fetchMock = vi.fn();

beforeEach(() => {
  process.env.DASHBOARD_PASSWORD = "secret";
  process.env.BACKUP_TRIGGER_URL = "https://backup.example";
  process.env.BACKUP_TRIGGER_SECRET = "backup-secret";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("backup-trigger route", () => {
  test("rejects a request without a session and never calls the backup service", async () => {
    const res = await POST(requestWithCookie());
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects a forged session cookie", async () => {
    const res = await POST(requestWithCookie(await createSessionToken("wrong-secret")));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("forwards POST to /trigger with the bearer secret and relays status + body", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ retryAfterSec: 120 }), { status: 429 }));
    const res = await POST(requestWithCookie(await createSessionToken("secret")));
    expect(fetchMock).toHaveBeenCalledWith("https://backup.example/trigger", {
      method: "POST",
      headers: { Authorization: "Bearer backup-secret" },
      cache: "no-store",
    });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ retryAfterSec: 120 });
  });

  test("forwards GET to /status", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ state: "idle" }), { status: 200 }));
    const res = await GET(requestWithCookie(await createSessionToken("secret")));
    expect(fetchMock.mock.calls[0][0]).toBe("https://backup.example/status");
    expect(res.status).toBe(200);
  });

  test("returns 500 when the backup env vars are missing", async () => {
    delete process.env.BACKUP_TRIGGER_SECRET;
    const res = await POST(requestWithCookie(await createSessionToken("secret")));
    expect(res.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("returns 502 when the backup service is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await POST(requestWithCookie(await createSessionToken("secret")));
    expect(res.status).toBe(502);
  });
});
