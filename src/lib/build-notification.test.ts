import { describe, expect, test } from "vitest";
import {
  buildAssigneeEmbed,
  buildCommentEmbed,
  buildDedupeKey,
  findAddedAssignee,
  type ClickupHistoryItem,
} from "./build-notification";

const user = { id: 183, username: "John", email: "john@company.com" };
const sam = { id: 184, username: "Sam", email: "sam@company.com" };

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
