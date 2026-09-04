import { describe, expect, test } from "vitest";
import { statusEmoji } from "./status-emoji";

describe("statusEmoji", () => {
  test.each([
    ["In Progress", "🔵"],
    ["Fix / Amend", "🔴"],
    ["Ready for Review", "🟠"],
    ["Ready for Deployment", "🟡"],
    ["Ready for UAT", "🟢"],
    ["Complete", "🟩"],
  ])("maps known status %s to %s regardless of hex color", (status, expected) => {
    expect(statusEmoji(status, "#7C4DFF")).toBe(expected);
  });

  test.each([
    ["#e50000", "🔴"],
    ["#4194f6", "🔵"],
    ["#6bc950", "🟢"],
    ["#ffcc00", "🟡"],
  ])("falls back to nearest color bucket %s -> %s for an unknown status", (hex, expected) => {
    expect(statusEmoji("some custom status", hex)).toBe(expected);
  });

  test("falls back to white for a missing/invalid color on an unknown status", () => {
    expect(statusEmoji("custom", undefined)).toBe("⚪");
    expect(statusEmoji("custom", "not-a-color")).toBe("⚪");
  });
});
