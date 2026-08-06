import { describe, expect, test } from "vitest";
import {
  buildAssigneeEmbed,
  buildCommentEmbed,
  buildDedupeKey,
  extractMentionedEmails,
  findAddedAssignee,
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
      title: "Fix login redirect bug",
      url: "https://app.clickup.com/t/t-1",
      description: "can we push this today",
      color: 0x5865f2,
      author: { name: "💬 John commented" },
      footer: { text: "Ticket t-1" },
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
    expect(embed.title).toBe("t-1");
    expect(embed.description).toHaveLength(300);
    expect(embed.description.endsWith("…")).toBe(true);
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
      title: "Fix login redirect bug",
      url: "https://app.clickup.com/t/t-1",
      description: "Assigned to **Sam**",
      color: 0x57f287,
      author: { name: "✅ John assigned" },
      footer: { text: "Ticket t-1" },
    });
  });
});
