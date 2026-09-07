import { describe, expect, test } from "vitest";
import { parseCommandTarget } from "./interaction-target";

describe("parseCommandTarget", () => {
  test("no options at all means the caller asked about themselves", () => {
    expect(parseCommandTarget({ name: "tickets-list" })).toBeNull();
    expect(parseCommandTarget(undefined)).toBeNull();
  });

  test("ignores options other than `user`", () => {
    expect(parseCommandTarget({ name: "tickets-list", options: [{ name: "week", type: 3, value: "next" }] })).toBeNull();
  });

  test("prefers the Discord display name over the raw username", () => {
    const target = parseCommandTarget({
      name: "tickets-list",
      options: [{ name: "user", type: 6, value: "42" }],
      resolved: { users: { "42": { username: "srabon444", global_name: "Ashraful" } } },
    });
    expect(target).toEqual({ discordUserId: "42", displayName: "Ashraful" });
  });

  test("falls back to the username when no display name is set", () => {
    const target = parseCommandTarget({
      name: "tickets-list",
      options: [{ name: "user", type: 6, value: "42" }],
      resolved: { users: { "42": { username: "srabon444", global_name: null } } },
    });
    expect(target?.displayName).toBe("srabon444");
  });

  test("still resolves the id when Discord sends no resolved block", () => {
    const target = parseCommandTarget({ name: "tickets-list", options: [{ name: "user", type: 6, value: "42" }] });
    expect(target).toEqual({ discordUserId: "42", displayName: "That user" });
  });

  test("a non-string or empty value is treated as absent", () => {
    expect(parseCommandTarget({ name: "x", options: [{ name: "user", type: 6, value: 42 }] })).toBeNull();
    expect(parseCommandTarget({ name: "x", options: [{ name: "user", type: 6, value: "" }] })).toBeNull();
  });
});
