export {};

import { getFilteredTeamTasks, getTeamMembers } from "../src/lib/clickup-client.ts";
import { postToDiscord } from "../src/lib/discord.ts";
import { supabaseServer } from "../src/lib/supabase-server.ts";
import { buildMemberCoverage, formatDayLines, weekdaysByDirection } from "../src/lib/week-coverage.ts";

const teamId = process.env.CLICKUP_TEAM_ID;
const webhookUrl = process.env.DISCORD_WEEKLY_WEBHOOK_URL;

if (!teamId || !webhookUrl) {
  console.error("Missing CLICKUP_TEAM_ID or DISCORD_WEEKLY_WEBHOOK_URL");
  process.exit(1);
}

const direction = (process.argv[2] ?? "next") as "next" | "current" | "prev";
if (!["next", "current", "prev"].includes(direction)) {
  console.error(`Invalid direction: ${direction}. Use: next, current, or prev`);
  process.exit(1);
}

const BOT_USERNAME = "Captain Ticket";
const BOT_AVATAR_URL = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/1f3ab.png";
const LEGEND = "✅ = active ticket   ·   ❌ = nothing scheduled";

const weekdays = weekdaysByDirection(direction);
const rangeLabel = `${weekdays[0].date} – ${weekdays[4].date}`;
const directionLabel = direction === "next" ? "Next week" : direction === "current" ? "This week" : "Last week";

const members = await getTeamMembers(teamId);

const { data: mappings, error: mappingError } = await supabaseServer
  .from("clickup_users")
  .select("clickup_user_id, discord_user_id, discord_display_name");

if (mappingError) {
  console.error("Failed to load clickup_users mapping:", mappingError.message);
  process.exit(1);
}

type Mapping = { discordUserId: string | null; discordDisplayName: string | null };

const mappingByClickupId = new Map<number, Mapping>(
  (mappings ?? []).map((m) => [
    Number(m.clickup_user_id),
    { discordUserId: m.discord_user_id as string | null, discordDisplayName: m.discord_display_name as string | null },
  ])
);

//! Members with no discord_user_id mapping can't be mentioned and aren't
//! shown at all — plenty of ClickUp accounts (clients, external contacts)
//! aren't on Discord and don't belong in this report.
const mappedMembers = members
  .map((m) => {
    const mapping = mappingByClickupId.get(m.id);
    return { ...m, discordUserId: mapping?.discordUserId ?? null, discordDisplayName: mapping?.discordDisplayName ?? null };
  })
  .filter((m): m is typeof m & { discordUserId: string } => m.discordUserId !== null);

//! Sort key is the person's actual Discord server nickname (set by hand,
//! same as discord_user_id) — sorting by their ClickUp username instead
//! doesn't match what Discord actually renders for the mention, so the
//! visible list looked unsorted.
const sortKeyByDiscordId = new Map(
  mappedMembers.map((m) => [m.discordUserId, m.discordDisplayName ?? m.username])
);

const tasks = await getFilteredTeamTasks(
  teamId,
  mappedMembers.map((m) => m.id)
);

const coverage = mappedMembers.map((member) =>
  buildMemberCoverage(
    member,
    tasks.filter((t) => t.assignees.some((a) => a.id === member.id)),
    weekdays
  )
);

//! Every mapped member is listed, gap or no gap — nobody gets silently
//! omitted just for being fully covered.
const sorted = coverage.sort((a, b) =>
  (sortKeyByDiscordId.get(a.discordUserId) ?? "").localeCompare(sortKeyByDiscordId.get(b.discordUserId) ?? "")
);

//! Discord always renders a message's `content` above its `embeds` — the
//! header has to live in `content` (not an embed) to actually appear on top
//! of the per-member list, which is also `content` (mentions only ping from
//! there, never from inside an embed).
const header = `🗓️ **${directionLabel}'s ticket coverage — ${rangeLabel}**\n\n${LEGEND}`;
const body = sorted.map((c) => `<@${c.discordUserId}>\n${formatDayLines(c.days)}`).join("\n\n");

const result = await postToDiscord(undefined, `${header}\n\n${body}`, BOT_USERNAME, BOT_AVATAR_URL, webhookUrl);

if (!result.ok) {
  console.error("Failed to post to Discord:", result.error);
  process.exit(1);
}

const flaggedCount = sorted.filter((c) => c.days.some((d) => !d.covered)).length;
console.log(`Posted coverage report — ${sorted.length} member(s) shown, ${flaggedCount} with a gap.`);
