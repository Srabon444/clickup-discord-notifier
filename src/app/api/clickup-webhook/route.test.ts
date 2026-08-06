import crypto from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/handle-event", () => ({ handleClickupEvent: vi.fn() }));

// `after()` needs a real Next.js request scope (AsyncLocalStorage) that
// doesn't exist when calling the route handler directly in Vitest — verified
// by running it unmocked and seeing it throw "called outside a request
// scope". Swap it for an immediate call so the response-shape tests below
// still exercise the real handler; the deferred-execution behavior itself is
// verified against the live dev server in Phase 8, not here.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (fn: () => unknown) => fn() };
});

const { POST } = await import("./route");
const { handleClickupEvent } = await import("@/lib/handle-event");

const secret = "test-webhook-secret";
const rawBody = JSON.stringify({
  event: "taskCommentPosted",
  webhook_id: "wh-1",
  task_id: "t-1",
  history_items: [],
});
const validSignature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

function postRequest(body: string, signature: string | null) {
  return new Request("http://localhost/api/clickup-webhook", {
    method: "POST",
    body,
    headers: signature ? { "x-signature": signature } : {},
  }) as never;
}

beforeEach(() => {
  process.env.CLICKUP_WEBHOOK_SECRET = secret;
  vi.mocked(handleClickupEvent).mockClear();
});

describe("POST /api/clickup-webhook", () => {
  test("rejects a missing signature with 401", async () => {
    const res = await POST(postRequest(rawBody, null));
    expect(res.status).toBe(401);
    expect(handleClickupEvent).not.toHaveBeenCalled();
  });

  test("rejects a tampered signature with 401", async () => {
    const res = await POST(postRequest(rawBody, "0".repeat(64)));
    expect(res.status).toBe(401);
    expect(handleClickupEvent).not.toHaveBeenCalled();
  });

  test("accepts a valid signature and returns 200", async () => {
    const res = await POST(postRequest(rawBody, validSignature));
    expect(res.status).toBe(200);
  });
});
