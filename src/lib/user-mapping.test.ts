import { beforeEach, describe, expect, test, vi } from "vitest";

const maybeSingleMock = vi.fn();
const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
const selectMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));

vi.mock("./supabase-server", () => ({
  supabaseServer: { from: fromMock },
}));

const { getDiscordMention } = await import("./user-mapping");

beforeEach(() => {
  fromMock.mockClear();
  selectMock.mockClear();
  eqMock.mockClear();
  maybeSingleMock.mockReset();
});

describe("getDiscordMention", () => {
  test("returns a ping when the email is mapped", async () => {
    maybeSingleMock.mockResolvedValue({ data: { discord_user_id: "111111111111111111" } });
    expect(await getDiscordMention("Ashraful@Company.com")).toBe("<@111111111111111111>");
    expect(fromMock).toHaveBeenCalledWith("clickup_users");
    expect(eqMock).toHaveBeenCalledWith("email", "ashraful@company.com");
  });

  test("returns null when unmapped or discord_user_id is empty", async () => {
    maybeSingleMock.mockResolvedValue({ data: { discord_user_id: null } });
    expect(await getDiscordMention("unknown@company.com")).toBeNull();
  });

  test("returns null when no row is found", async () => {
    maybeSingleMock.mockResolvedValue({ data: null });
    expect(await getDiscordMention("nobody@company.com")).toBeNull();
  });

  test("returns null for a missing email without querying", async () => {
    expect(await getDiscordMention(undefined)).toBeNull();
    expect(await getDiscordMention(null)).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });
});
