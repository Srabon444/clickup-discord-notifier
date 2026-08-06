import { describe, expect, test } from "vitest";
import { CLICKUP_TO_DISCORD, getDiscordMention } from "./user-mapping";

describe("getDiscordMention", () => {
  test("returns a ping for a mapped email (case-insensitive)", () => {
    CLICKUP_TO_DISCORD["ashraful@company.com"] = "111111111111111111";
    expect(getDiscordMention("Ashraful@Company.com")).toBe("<@111111111111111111>");
  });

  test("returns null for an unmapped email", () => {
    expect(getDiscordMention("unknown@company.com")).toBeNull();
  });

  test("returns null for a missing email", () => {
    expect(getDiscordMention(undefined)).toBeNull();
    expect(getDiscordMention(null)).toBeNull();
  });
});
