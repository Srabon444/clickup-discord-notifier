import { describe, expect, test } from "vitest";
import {
  buildAssigneeEmbed,
  buildCommentEmbed,
  buildDedupeKey,
  buildStatusEmbed,
  extractMentionedEmails,
  findAddedAssignee,
  findStatusChange,
  type ClickupHistoryItem,
} from "./build-notification";

const user = { id: 183, username: "John", email: "john@company.com" };
const sam = { id: 184, username: "Sam", email: "sam@company.com" };

// Real payload captured from a live ClickUp webhook delivery (see the events
// table) — a mention is a comment[] item with type "tag" and its own user.
const realMentionHistoryItem: ClickupHistoryItem = {
  id: "5205032651904199671",
  field: "comment",
  user: { id: 107464442, username: "Ashraful Islam", email: "ashraful.islam@techzu.site" },
  before: null,
  after: "90180244600221",
  comment: {
    id: "90180244600221",
    text_content: "@Arabin I am handling this.\n",
    user: { id: 107464442, username: "Ashraful Islam", email: "ashraful.islam@techzu.site" },
    comment: [
      {
        text: "@Arabin",
        type: "tag",
        user: { id: 113454616, username: "Arabin", email: "md.asaduzzaman@techzu.site" },
      },
      { text: " I am handling this.", attributes: {} },
      { text: "\n", attributes: { "block-id": "block-ccTBf8a92n" } },
    ],
  },
};

describe("extractMentionedEmails", () => {
  test("finds the mentioned user's email from a real comment payload", () => {
    expect(extractMentionedEmails(realMentionHistoryItem)).toEqual(["md.asaduzzaman@techzu.site"]);
  });

  test("returns [] for a comment with no mentions", () => {
    const item: ClickupHistoryItem = {
      id: "hi-1",
      field: "comment",
      user,
      before: null,
      after: null,
      comment: { id: "c-1", text_content: "no mentions here", user, comment: [{ text: "no mentions here" }] },
    };
    expect(extractMentionedEmails(item)).toEqual([]);
  });

  test("dedupes the same person mentioned twice", () => {
    const tag = { text: "@Arabin", type: "tag", user: { id: 1, username: "Arabin", email: "a@b.com" } };
    const item: ClickupHistoryItem = {
      id: "hi-2",
      field: "comment",
      user,
      before: null,
      after: null,
      comment: { id: "c-2", text_content: "@Arabin @Arabin", user, comment: [tag, tag] },
    };
    expect(extractMentionedEmails(item)).toEqual(["a@b.com"]);
  });

  test("returns [] when there's no comment on the history item", () => {
    const item: ClickupHistoryItem = { id: "hi-3", field: "assignee_add", user, before: null, after: null };
    expect(extractMentionedEmails(item)).toEqual([]);
  });
});

describe("buildDedupeKey", () => {
  test("combines webhook_id and the first history item's id", () => {
    const key = buildDedupeKey({
      event: "taskCommentPosted",
      webhook_id: "wh-1",
      task_id: "t-1",
      history_items: [{ id: "hi-1", field: "comment", user, before: null, after: null }],
    });
    expect(key).toBe("wh-1:hi-1");
  });
});

describe("findAddedAssignee", () => {
  const addItem: ClickupHistoryItem = {
    id: "hi-1",
    field: "assignee_add",
    user,
    before: null,
    after: sam,
  };
  const removeItem: ClickupHistoryItem = {
    id: "hi-2",
    field: "assignee_remove",
    user,
    before: sam,
    after: null,
  };

  test("added-only: returns the added assignee", () => {
    expect(findAddedAssignee([addItem])).toEqual(sam);
  });

  test("removed-only: returns null (no notification)", () => {
    expect(findAddedAssignee([removeItem])).toBeNull();
  });

  test("mixed: returns the added assignee, ignores the removal", () => {
    expect(findAddedAssignee([removeItem, addItem])).toEqual(sam);
  });
});

describe("message formatting", () => {
  test("comment embed", () => {
    const embed = buildCommentEmbed({
      taskId: "t-1",
      taskName: "Fix login redirect bug",
      taskUrl: "https://app.clickup.com/t/t-1",
      commentText: "can we push this today",
      authorUsername: "John",
    });
    expect(embed).toEqual({
      title: "💬 Fix login redirect bug",
      url: "https://app.clickup.com/t/t-1",
      description: "**John** commented:\n> can we push this today\n\nTicket: `t-1`",
      color: 0x5865f2,
      timestamp: undefined,
    });
  });

  test("comment embed truncates long text", () => {
    const embed = buildCommentEmbed({
      taskId: "t-1",
      taskName: null,
      taskUrl: "https://app.clickup.com/t/t-1",
      commentText: "x".repeat(400),
      authorUsername: "John",
    });
    expect(embed.title).toBe("💬 t-1");
    expect(embed.description).toContain("…\n\nTicket: `t-1`");
    const excerpt = embed.description.split("\n\nTicket:")[0];
    expect(excerpt).toHaveLength("**John** commented:\n> ".length + 300);
  });

  test("comment embed converts the ClickUp epoch-ms date to an ISO timestamp", () => {
    const embed = buildCommentEmbed({
      taskId: "t-1",
      taskName: null,
      taskUrl: "https://app.clickup.com/t/t-1",
      commentText: "hi",
      authorUsername: "John",
      date: "1642737045116",
    });
    expect(embed.timestamp).toBe(new Date(1642737045116).toISOString());
  });

  test("assignee embed", () => {
    const embed = buildAssigneeEmbed({
      taskId: "t-1",
      taskName: "Fix login redirect bug",
      taskUrl: "https://app.clickup.com/t/t-1",
      assigneeUsername: "Sam",
      actorUsername: "John",
    });
    expect(embed).toEqual({
      title: "✅ Fix login redirect bug",
      url: "https://app.clickup.com/t/t-1",
      description: "**John** assigned this to **Sam**\n\nTicket: `t-1`",
      color: 0x57f287,
      timestamp: undefined,
    });
  });
});

describe("buildStatusEmbed", () => {
  test("uses ClickUp's own status color and title-cases the status names", () => {
    const embed = buildStatusEmbed({
      taskId: "t-1",
      taskName: "Fix login redirect bug",
      taskUrl: "https://app.clickup.com/t/t-1",
      actorUsername: "John",
      fromStatus: "to do",
      toStatus: "in progress",
      colorHex: "#7C4DFF",
    });
    expect(embed).toEqual({
      title: "🔄 Fix login redirect bug",
      url: "https://app.clickup.com/t/t-1",
      description: "**John** changed status: To Do → **In Progress**\n\nTicket: `t-1`",
      color: 0x7c4dff,
      timestamp: undefined,
    });
  });

  test("falls back to a neutral color when colorHex is missing/invalid", () => {
    const embed = buildStatusEmbed({
      taskId: "t-1",
      taskName: null,
      taskUrl: "https://app.clickup.com/t/t-1",
      actorUsername: "John",
      fromStatus: "to do",
      toStatus: "done",
      colorHex: undefined,
    });
    expect(embed.color).toBe(0x99aab5);
  });
});

describe("findStatusChange", () => {
  test("returns actor, from, and to status", () => {
    const statusItem: ClickupHistoryItem = {
      id: "hi-5",
      field: "status",
      user,
      before: { status: "to do", color: "#f9d900", type: "open" },
      after: { status: "in progress", color: "#7C4DFF", type: "custom" },
    };
    expect(findStatusChange([statusItem])).toEqual({
      actor: user,
      from: { status: "to do", color: "#f9d900", type: "open" },
      to: { status: "in progress", color: "#7C4DFF", type: "custom" },
    });
  });

  test("returns null when there's no status field in history_items", () => {
    expect(findStatusChange([{ id: "hi-6", field: "comment", user, before: null, after: null }])).toBeNull();
  });
});
