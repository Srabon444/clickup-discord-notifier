import { getFilteredTeamTasks, getTeamMembers } from "./clickup-client";
import { postToDiscord } from "./discord";
import { supabaseServer } from "./supabase-server";
import { buildMemberCoverage, formatDayLines, weekdaysByDirection } from "./week-coverage";

const BOT_USERNAME = "Captain Ticket";
const BOT_AVATAR_URL = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/1f3ab.png";
const LEGEND = "✅ = active ticket   ·   ❌ = nothing scheduled";

export async function triggerNotification(
  direction: "next" | "current" | "prev" = "next"
): Promise<{ success: boolean; message: string; membersShown: number; membersWithGap: number }> {
  const teamId = process.env.CLICKUP_TEAM_ID;
  const webhookUrl = process.env.DISCORD_WEEKLY_WEBHOOK_URL;

  if (!teamId || !webhookUrl) {
    return { success: false, message: "Missing CLICKUP_TEAM_ID or DISCORD_WEEKLY_WEBHOOK_URL", membersShown: 0, membersWithGap: 0 };
  }

  try {
    const weekdays = weekdaysByDirection(direction);
    const rangeLabel = `${weekdays[0].date} – ${weekdays[4].date}`;
    const directionLabel = direction === "next" ? "Next week" : direction === "current" ? "This week" : "Last week";

    const members = await getTeamMembers(teamId);

    const { data: mappings, error: mappingError } = await supabaseServer
      .from("clickup_users")
      .select("clickup_user_id, discord_user_id, discord_display_name");

    if (mappingError) {
      return { success: false, message: `Failed to load mappings: ${mappingError.message}`, membersShown: 0, membersWithGap: 0 };
    }

    type Mapping = { discordUserId: string | null; discordDisplayName: string | null };

    const mappingByClickupId = new Map<number, Mapping>(
      (mappings ?? []).map((m) => [
        Number(m.clickup_user_id),
        { discordUserId: m.discord_user_id as string | null, discordDisplayName: m.discord_display_name as string | null },
      ])
    );

    const mappedMembers = members
      .map((m) => {
        const mapping = mappingByClickupId.get(m.id);
        return { ...m, discordUserId: mapping?.discordUserId ?? null, discordDisplayName: mapping?.discordDisplayName ?? null };
      })
      .filter((m): m is typeof m & { discordUserId: string } => m.discordUserId !== null);

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

    const sorted = coverage.sort((a, b) =>
      (sortKeyByDiscordId.get(a.discordUserId) ?? "").localeCompare(sortKeyByDiscordId.get(b.discordUserId) ?? "")
    );

    const header = `🗓️ **${directionLabel}'s ticket coverage — ${rangeLabel}**\n\n${LEGEND}`;
    const body = sorted.map((c) => `<@${c.discordUserId}>\n${formatDayLines(c.days)}`).join("\n\n");

    const result = await postToDiscord(undefined, `${header}\n\n${body}`, BOT_USERNAME, BOT_AVATAR_URL, webhookUrl);

    if (!result.ok) {
      return { success: false, message: `Failed to post to Discord: ${result.error}`, membersShown: sorted.length, membersWithGap: 0 };
    }

    const flaggedCount = sorted.filter((c) => c.days.some((d) => !d.covered)).length;
    return {
      success: true,
      message: `Posted ${directionLabel.toLowerCase()} coverage report`,
      membersShown: sorted.length,
      membersWithGap: flaggedCount,
    };
  } catch (error) {
    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      membersShown: 0,
      membersWithGap: 0,
    };
  }
}
