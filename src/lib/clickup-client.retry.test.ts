import { afterEach, describe, expect, test, vi } from "vitest";
import { getTask } from "./clickup-client";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllEnvs();
});

function response(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

describe("ClickUp 429 handling", () => {
  test("retries a rate-limited read and returns the eventual success", async () => {
    vi.stubEnv("CLICKUP_API_TOKEN", "tok");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(429, {}, { "retry-after": "0" }))
      .mockResolvedValueOnce(response(200, { id: "abc", subtasks: [{ id: "kid" }] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const task = await getTask("abc", true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("include_subtasks=true");
    expect(task.subtasks).toHaveLength(1);
  });

  test("gives up after the retry budget and surfaces the failure", async () => {
    vi.stubEnv("CLICKUP_API_TOKEN", "tok");
    const fetchMock = vi.fn().mockResolvedValue(response(429, {}, { "retry-after": "0" }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(getTask("abc")).rejects.toThrow("429");
    expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});
