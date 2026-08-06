import { getTask } from "./clickup-client";
import { postToDiscord } from "./discord";
import {
  buildAssigneeEmbed,
  buildCommentEmbed,
  buildDedupeKey,
  findAddedAssignee,
  type ClickupWebhookPayload,
} from "./build-notification";
import type { DiscordEmbed } from "./discord";
import { supabaseServer } from "./supabase-server";
import { getDiscordMention } from "./user-mapping";

export async function handleClickupEvent(payload: ClickupWebhookPayload): Promise<void> {
  let taskName: string | null = null;
  let taskUrl = `https://app.clickup.com/t/${payload.task_id}`;
  try {
    const task = await getTask(payload.task_id);
    taskName = task.name;
    taskUrl = task.url || taskUrl;
  } catch {
    //! Task lookup is best-effort context only — the notification still
    //! fires (with task_id as the title) if ClickUp's read API is down.
  }

  const embed = buildEmbedForEvent(payload, taskName, taskUrl);
  if (!embed) return;

  const result = await postToDiscord(embed, buildMentionContent(payload));

  await supabaseServer.from("events").upsert(
    {
      event_type: payload.event,
      task_id: payload.task_id,
      task_name: taskName,
      dedupe_key: buildDedupeKey(payload),
      raw_payload: payload,
      discord_status: result.ok ? "success" : "failed",
      error_message: result.ok ? null : result.error,
    },
    { onConflict: "dedupe_key", ignoreDuplicates: true }
  );
}

// Real @mention/ping — only wired up for assignment for now, since that's
// the one event with a known recipient without the deferred comment-mention
// parser (see the TODO below).
function buildMentionContent(payload: ClickupWebhookPayload): string | undefined {
  if (payload.event !== "taskAssigneeUpdated") return undefined;
  const assignee = findAddedAssignee(payload.history_items);
  return getDiscordMention(assignee?.email) ?? undefined;
}

function buildEmbedForEvent(
  payload: ClickupWebhookPayload,
  taskName: string | null,
  taskUrl: string
): DiscordEmbed | null {
  if (payload.event === "taskCommentPosted") {
    const item = payload.history_items[0];
    if (!item?.comment) return null;

    // TODO: mention detection. ClickUp doesn't publicly document the
    // rich-text attribute a mention uses — this logs the raw shape so the
    // parser can be written from a real payload instead of a guess.
    console.log("RAW_COMMENT_PAYLOAD", JSON.stringify(item.comment));

    return buildCommentEmbed({
      taskId: payload.task_id,
      taskName,
      taskUrl,
      commentText: item.comment.text_content,
      authorUsername: item.comment.user.username,
    });
  }

  if (payload.event === "taskAssigneeUpdated") {
    const assignee = findAddedAssignee(payload.history_items);
    if (!assignee) return null;
    const actor = payload.history_items.find((item) => item.field === "assignee_add")?.user;

    return buildAssigneeEmbed({
      taskId: payload.task_id,
      taskName,
      taskUrl,
      assigneeUsername: assignee.username,
      actorUsername: actor?.username ?? "someone",
    });
  }

  return null;
}
