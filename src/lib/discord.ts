export type DiscordEmbed = {
  title: string;
  url?: string;
  description: string;
  color: number;
  timestamp?: string;
};

export type DiscordPostResult = { ok: true } | { ok: false; error: string };

export async function postToDiscord(
  embed?: DiscordEmbed,
  content?: string,
  username?: string,
  avatarUrl?: string,
  webhookUrl: string | undefined = process.env.DISCORD_WEBHOOK_URL
): Promise<DiscordPostResult> {
  if (!webhookUrl) return { ok: false, error: "Missing DISCORD_WEBHOOK_URL" };

  try {
    console.log("[DISCORD] POST to", webhookUrl?.substring(0, 50) + "...");
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
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        ...(embed ? { embeds: [embed] } : {}),
      }),
    });
    console.log("[DISCORD] Response:", res.status);
    if (!res.ok) {
      const text = await res.text();
      console.log("[DISCORD] Error body:", text);
      return { ok: false, error: `Discord responded ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
