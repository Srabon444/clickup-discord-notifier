export type DiscordEmbed = {
  title: string;
  url: string;
  description: string;
  color: number;
  author: { name: string };
  footer: { text: string };
};

export type DiscordPostResult = { ok: true } | { ok: false; error: string };

export async function postToDiscord(
  embed: DiscordEmbed,
  content?: string
): Promise<DiscordPostResult> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return { ok: false, error: "Missing DISCORD_WEBHOOK_URL" };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // ! A ping only fires from `content` — Discord does not notify on
      // ! mentions placed inside an embed.
      body: JSON.stringify(content ? { content, embeds: [embed] } : { embeds: [embed] }),
    });
    if (!res.ok) {
      return { ok: false, error: `Discord responded ${res.status}: ${await res.text()}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
