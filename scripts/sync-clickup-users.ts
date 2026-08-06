export {};

import { getTeamMembers } from "../src/lib/clickup-client.ts";
import { supabaseServer } from "../src/lib/supabase-server.ts";

const teamId = process.env.CLICKUP_TEAM_ID;
if (!teamId) {
  console.error("Missing CLICKUP_TEAM_ID (set it in .env.local)");
  process.exit(1);
}

const members = await getTeamMembers(teamId);

// ! Deliberately omits discord_user_id — upsert only touches the columns in
// ! this payload, so a Discord id set manually is never overwritten.
const { error } = await supabaseServer.from("clickup_users").upsert(
  members.map((m) => ({
    clickup_user_id: m.id,
    username: m.username,
    email: m.email.toLowerCase(),
    updated_at: new Date().toISOString(),
  })),
  { onConflict: "clickup_user_id" }
);

if (error) {
  console.error("Sync failed:", error.message);
  process.exit(1);
}

console.log(`Synced ${members.length} ClickUp members.`);
