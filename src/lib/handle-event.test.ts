import { beforeEach, describe, expect, test, vi } from "vitest";

const upsertMock = vi.fn().mockResolvedValue({ error: null });
const maybeSingleMock = vi.fn().mockResolvedValue({ data: null });
const fromMock = vi.fn((table: string) => {
  if (table === "clickup_users") {
    return { select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }) };
  }
  return { upsert: upsertMock };
});

vi.mock("./supabase-server", () => ({
  supabaseServer: { from: fromMock },
}));

const { handleClickupEvent } = await import("./handle-event");

const johnUser = { id: 183, username: "John", email: "john@company.com" };
const samUser = { id: 184, username: "Sam", email: "sam@company.com" };

const commentPayload = {
  event: "taskCommentPosted",
  webhook_id: "wh-1",
  task_id: "t-1",
  history_items: [
    {
      id: "hi-1",
      field: "comment",
      user: johnUser,
      before: null,
      after: "648893191",
      comment: {
        id: "648893191",
        text_content: "can we push this today\n",
        comment: [{ text: "can we push this today\n" }],
        user: johnUser,
      },
    },
  ],
};

const assigneeAddPayload = {
  event: "taskAssigneeUpdated",
  webhook_id: "wh-1",
  task_id: "t-1",
  history_items: [{ id: "hi-2", field: "assignee_add", user: johnUser, before: null, after: samUser }],
};

const assigneeRemovePayload = {
  event: "taskAssigneeUpdated",
  webhook_id: "wh-1",
  task_id: "t-1",
  history_items: [{ id: "hi-3", field: "assignee_remove", user: johnUser, before: samUser, after: null }],
};

function stubFetch(discordOk: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.includes("api.clickup.com")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ id: "t-1", name: "Fix login redirect bug", url: "https://app.clickup.com/t/t-1" }),
            { status: 200 }
          )
        );
      }
      return discordOk
        ? Promise.resolve(new Response(null, { status: 204 }))
        : Promise.resolve(new Response("discord error", { status: 500 }));
    })
  );
}

beforeEach(() => {
  upsertMock.mockClear();
  fromMock.mockClear();
  maybeSingleMock.mockReset().mockResolvedValue({ data: null });
  vi.unstubAllGlobals();
  process.env.CLICKUP_API_TOKEN = "test-token";
  process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/test";
});

describe("handleClickupEvent", () => {
  test("comment posted: builds the Discord payload and logs success", async () => {
    stubFetch(true);
    await handleClickupEvent(commentPayload as never);

    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
    const discordCall = calls.find((call) => call[0].includes("discord.com"));
    expect(discordCall).toBeTruthy();

    const body = JSON.parse(discordCall![1].body as string);
    expect(body.embeds[0]).toMatchObject({
      title: "Fix login redirect bug",
      url: "https://app.clickup.com/t/t-1",
      description: "can we push this today\n",
      author: { name: "💬 John commented" },
      footer: { text: "Ticket t-1" },
    });

    expect(fromMock).toHaveBeenCalledWith("events");
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "taskCommentPosted",
        task_id: "t-1",
        dedupe_key: "wh-1:hi-1",
        discord_status: "success",
      }),
      expect.objectContaining({ onConflict: "dedupe_key" })
    );
  });

  test("assignee added: notifies and logs", async () => {
    stubFetch(true);
    await handleClickupEvent(assigneeAddPayload as never);

    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
    expect(calls.some((call) => call[0].includes("discord.com"))).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: "taskAssigneeUpdated", discord_status: "success" }),
      expect.anything()
    );
  });

  test("assignee added: pings the mapped Discord user via content", async () => {
    stubFetch(true);
    maybeSingleMock.mockResolvedValue({ data: { discord_user_id: "999999999999999999" } });
    await handleClickupEvent(assigneeAddPayload as never);

    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
    const discordCall = calls.find((call) => call[0].includes("discord.com"));
    const body = JSON.parse(discordCall![1].body as string);
    expect(body.content).toBe("<@999999999999999999>");
  });

  test("assignee added: no content field when the assignee isn't mapped", async () => {
    stubFetch(true);
    await handleClickupEvent(assigneeAddPayload as never);

    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
    const discordCall = calls.find((call) => call[0].includes("discord.com"));
    const body = JSON.parse(discordCall![1].body as string);
    expect(body.content).toBeUndefined();
  });

  test("assignee removed only: no Discord post, nothing logged (noise reduction)", async () => {
    stubFetch(true);
    await handleClickupEvent(assigneeRemovePayload as never);

    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
    expect(calls.some((call) => call[0].includes("discord.com"))).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  test("Discord failure still logs the event with discord_status=failed", async () => {
    stubFetch(false);
    await handleClickupEvent(commentPayload as never);

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ discord_status: "failed", error_message: expect.stringContaining("500") }),
      expect.anything()
    );
  });
});
