import { supabaseServer } from "./supabase-server";

const DAILY_LIMIT = 3;
const DHAKA_TZ = "Asia/Dhaka";

export type UsageResult = { allowed: boolean; count: number };

//! Increment-then-check via a single atomic Postgres upsert (see
//! supabase/003_command_usage.sql) — a separate "check, then increment"
//! would race under concurrent requests and let a spammer past the limit.
export async function checkAndIncrementUsage(discordUserId: string): Promise<UsageResult> {
  const usageDate = new Intl.DateTimeFormat("en-CA", { timeZone: DHAKA_TZ }).format(new Date());
  const { data, error } = await supabaseServer.rpc("increment_command_usage", {
    p_discord_user_id: discordUserId,
    p_usage_date: usageDate,
  });
  if (error) throw new Error(`Rate limit check failed: ${error.message}`);
  const count = data as number;
  return { allowed: count <= DAILY_LIMIT, count };
}
