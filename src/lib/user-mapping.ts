import { supabaseServer } from "./supabase-server";

// Discord id lives in the clickup_users table (see supabase/002_clickup_users.sql),
// kept in sync with ClickUp via scripts/sync-clickup-users.ts. The
// discord_user_id column is set manually once per person (no API links a
// ClickUp account to a Discord account) and untouched by the daily sync.
//
// A real @mention/ping only fires from a message's `content` field (Discord
// doesn't notify on mentions inside embeds) — see discord.ts.
export async function getDiscordMention(email: string | undefined | null): Promise<string | null> {
  if (!email) return null;

  const { data } = await supabaseServer
    .from("clickup_users")
    .select("discord_user_id")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  return data?.discord_user_id ? `<@${data.discord_user_id}>` : null;
}
