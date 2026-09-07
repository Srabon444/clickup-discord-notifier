import { getFilteredTeamTasks, getTask, getTeamMembers, type ClickupTaskWithDates } from "./clickup-client.ts";
import { postToDiscord } from "./discord.ts";
import { supabaseServer } from "./supabase-server.ts";
import {
  buildMemberCoverage,
  excludeParentTasks,
  formatDayLines,
  parentIdsFromTasks,
  taskCoversDayForReport,
  weekdaysByDirection,
  type Weekday,
} from "./week-coverage.ts";

const BOT_USERNAME = "Captain Ticket";
const BOT_AVATAR_URL = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/1f3ab.png";
const LEGEND = "✅ = active ticket   ·   ❌ = nothing scheduled";

const SUBTASK_CHECK_CONCURRENCY = 20;

//! Only tasks that actually cover a day in this window can change anyone's
//! ✅/❌, so nothing else is worth an API call. Tasks already known to be
//! parents from the free pre-pass are skipped too.
async function resolveParentIds(tasks: ClickupTaskWithDates[], weekdays: Weekday[]): Promise<Set<string>> {
  const parentIds = parentIdsFromTasks(tasks);
  const candidates = [
    ...new Set(
      tasks
        .filter((t) => !parentIds.has(t.id) && weekdays.some((w) => taskCoversDayForReport(t, w.date)))
        .map((t) => t.id)
    ),
  ];

  //! Chunked instead of one big Promise.all — ClickUp's token limit is around
  //! 100 requests/minute and a busy week can produce more candidates than that.
  // ponytail: fixed chunk size, no backoff — swap for a real rate-limited
  // queue only if this starts hitting 429s.
  for (let i = 0; i < candidates.length; i += SUBTASK_CHECK_CONCURRENCY) {
    const chunk = candidates.slice(i, i + SUBTASK_CHECK_CONCURRENCY);
    const found = await Promise.all(
      chunk.map(async (id) => {
        try {
          const full = await getTask(id, true);
          return full.subtasks?.length ? id : null;
        } catch (error) {
          //! A failed lookup falls back to treating the task as a leaf (it
          //! counts) — one API hiccup shouldn't turn someone's day red.
          console.error(`[NOTIFY] subtask check failed for ${id}:`, error);
          return null;
        }
      })
    );
    for (const id of found) if (id) parentIds.add(id);
  }

  return parentIds;
}

export async function triggerNotification(
  direction: "next" | "current" | "prev" = "next",
  includeParent = false
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

    //! Default: a ticket with subtasks doesn't count for whoever is assigned
    //! to it — only leaf tickets do. Sitting on the umbrella while the
    //! subtasks belong to someone else is a gap, so that day goes ❌.
    const coverageTasks = includeParent ? tasks : excludeParentTasks(tasks, await resolveParentIds(tasks, weekdays));

    const coverage = mappedMembers.map((member) =>
      buildMemberCoverage(
        member,
        coverageTasks.filter((t) => t.assignees.some((a) => a.id === member.id)),
        weekdays
      )
    );

    const sorted = coverage.sort((a, b) =>
      (sortKeyByDiscordId.get(a.discordUserId) ?? "").localeCompare(sortKeyByDiscordId.get(b.discordUserId) ?? "")
    );

    //? The two modes render identically otherwise — nobody reading Discord
    //? could tell which rule produced the report.
    const modeNote = includeParent ? "\n_Parent tickets included._" : "";
    const header = `🗓️ **${directionLabel}'s ticket coverage — ${rangeLabel}**\n\n${LEGEND}${modeNote}`;
    const body = sorted.map((c) => `<@${c.discordUserId}>\n${formatDayLines(c.days)}`).join("\n\n");

    console.log("[NOTIFY] Posting to webhook:", webhookUrl?.substring(0, 50) + "...");
    const result = await postToDiscord(undefined, `${header}\n\n${body}`, BOT_USERNAME, BOT_AVATAR_URL, webhookUrl);
    console.log("[NOTIFY] Result:", result);

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
