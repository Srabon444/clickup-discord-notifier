import { describe, expect, test } from "vitest";
import * as clickupClient from "./clickup-client";

// ! This is the guardrail from the hard constraint: fails loudly if a future
// ! change exposes a write/mutate call against tasks, comments, or assignees.
const ALLOWED_EXPORTS = new Set([
  "getTask",
  "getTeamMembers",
  "createWebhook",
  "listWebhooks",
  "updateWebhook",
  "deleteWebhook",
]);
const FORBIDDEN_NAME = /(create|update|delete|remove|set)(task|comment|assignee)/i;

describe("clickup-client read-only guard", () => {
  test("exposes nothing beyond the allowlist", () => {
    expect(Object.keys(clickupClient).sort()).toEqual([...ALLOWED_EXPORTS].sort());
  });

  test("no export name matches a task/comment/assignee mutation pattern", () => {
    for (const name of Object.keys(clickupClient)) {
      expect(FORBIDDEN_NAME.test(name)).toBe(false);
    }
  });
});
