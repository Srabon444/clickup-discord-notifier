// ClickUp email -> Discord user id. A real @mention/ping only fires from a
// message's `content` field (Discord doesn't notify on mentions inside
// embeds) — see discord.ts. Unmapped users just show up as plain text, no
// broken ping.
export const CLICKUP_TO_DISCORD: Record<string, string> = {
  // "name@company.com": "123456789012345678",
};

export function getDiscordMention(email: string | undefined | null): string | null {
  if (!email) return null;
  const discordId = CLICKUP_TO_DISCORD[email.toLowerCase()];
  return discordId ? `<@${discordId}>` : null;
}
