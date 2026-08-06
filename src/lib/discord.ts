export type DiscordEmbed = {
  title: string;
  url: string;
  description: string;
  color: number;
  timestamp?: string;
};

export type DiscordPostResult = { ok: true } | { ok: false; error: string };

export async function postToDiscord(
  embed: DiscordEmbed,
  content?: string,
  username?: string
): Promise<DiscordPostResult> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return { ok: false, error: "Missing DISCORD_WEBHOOK_URL" };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // ! A ping only fires from `content` — Discord does not notify on
      // ! mentions placed inside an embed.
      //! Discord groups consecutive messages from the same displayed
      //! username within an ~8 min window (no header/spacing shown between
      //! them). Verified empirically: overriding `username` per message
      //! starts a fresh group. Not a documented API guarantee — a client UI
      //! behavior Discord could change.
      body: JSON.stringify({
        ...(content ? { content } : {}),
        ...(username ? { username } : {}),
        embeds: [embed],
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `Discord responded ${res.status}: ${await res.text()}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
