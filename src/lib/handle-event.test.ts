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

const commentWithMentionPayload = {
  event: "taskCommentPosted",
  webhook_id: "wh-1",
  task_id: "t-1",
  history_items: [
    {
      id: "hi-4",
      field: "comment",
      user: johnUser,
      before: null,
      after: "c-2",
      comment: {
        id: "c-2",
        text_content: "@Sam can you check this?",
        user: johnUser,
        comment: [
          { text: "@Sam", type: "tag", user: samUser },
          { text: " can you check this?", attributes: {} },
        ],
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

const statusChangedBySomeoneElsePayload = {
  event: "taskStatusUpdated",
  webhook_id: "wh-1",
  task_id: "t-1",
  history_items: [
    {
      id: "hi-7",
      field: "status",
      user: johnUser,
      before: { status: "to do", color: "#f9d900", type: "open" },
      after: { status: "in progress", color: "#7C4DFF", type: "custom" },
    },
  ],
};

const statusChangedBySelfPayload = {
  event: "taskStatusUpdated",
  webhook_id: "wh-1",
  task_id: "t-1",
  history_items: [
    {
      id: "hi-8",
      field: "status",
      user: samUser,
      before: { status: "to do", color: "#f9d900", type: "open" },
      after: { status: "done", color: "#6bc950", type: "closed" },
    },
  ],
};

function stubFetch(
  discordOk: boolean,
  assignees: Array<{ id: number; username: string; email: string }> = [johnUser, samUser]
) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.includes("api.clickup.com")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: "t-1",
              name: "Fix login redirect bug",
              url: "https://app.clickup.com/t/t-1",
              assignees,
            }),
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
      title: "💬 Fix login redirect bug",
      url: "https://app.clickup.com/t/t-1",
      description: "**John** commented:\n> can we push this today\n\n\nTicket: `t-1`",
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

  test("comment posted: username varies by event type + ticket (breaks Discord's message grouping)", async () => {
    stubFetch(true);
    await handleClickupEvent(commentPayload as never);

    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
    const discordCall = calls.find((call) => call[0].includes("discord.com"));
    const body = JSON.parse(discordCall![1].body as string);
    expect(body.username).toBe("💬 t-1");
  });

  test("comment posted: no content field when nobody is mentioned", async () => {
    stubFetch(true);
    await handleClickupEvent(commentPayload as never);

    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
    const discordCall = calls.find((call) => call[0].includes("discord.com"));
    const body = JSON.parse(discordCall![1].body as string);
    expect(body.content).toBeUndefined();
  });

  test("comment posted: pings a mentioned user who is mapped", async () => {
    stubFetch(true);
    maybeSingleMock.mockResolvedValue({ data: { discord_user_id: "888888888888888888" } });
    await handleClickupEvent(commentWithMentionPayload as never);

    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
    const discordCall = calls.find((call) => call[0].includes("discord.com"));
    const body = JSON.parse(discordCall![1].body as string);
    expect(body.content).toBe("<@888888888888888888>");
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

  test("status changed: pings the assignee when someone else changed it", async () => {
    stubFetch(true, [samUser]); // Sam is the assignee; John (not the assignee) changes status
    maybeSingleMock.mockResolvedValue({ data: { discord_user_id: "777777777777777777" } });
    await handleClickupEvent(statusChangedBySomeoneElsePayload as never);

    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
    const discordCall = calls.find((call) => call[0].includes("discord.com"));
    const body = JSON.parse(discordCall![1].body as string);
    expect(body.content).toBe("<@777777777777777777>");
    expect(body.embeds[0]).toMatchObject({
      title: "🔄 Fix login redirect bug",
      description: expect.stringContaining("To Do → 🟣 **In Progress**"),
      color: 0x7c4dff,
    });
  });

  test("status changed: no ping when the assignee changed their own ticket's status", async () => {
    stubFetch(true, [samUser]); // Sam is the assignee AND the one changing status
    maybeSingleMock.mockResolvedValue({ data: { discord_user_id: "777777777777777777" } });
    await handleClickupEvent(statusChangedBySelfPayload as never);

    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
    const discordCall = calls.find((call) => call[0].includes("discord.com"));
    expect(discordCall).toBeTruthy();
    const body = JSON.parse(discordCall![1].body as string);
    expect(body.content).toBeUndefined();
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
