import { getTask } from "./clickup-client";
import { postToDiscord } from "./discord";
import {
  buildAssigneeEmbed,
  buildCommentEmbed,
  buildDedupeKey,
  extractMentionedEmails,
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

  const result = await postToDiscord(embed, await buildMentionContent(payload));

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

async function buildMentionContent(payload: ClickupWebhookPayload): Promise<string | undefined> {
  if (payload.event === "taskAssigneeUpdated") {
    const assignee = findAddedAssignee(payload.history_items);
    return (await getDiscordMention(assignee?.email)) ?? undefined;
  }

  if (payload.event === "taskCommentPosted") {
    const item = payload.history_items[0];
    if (!item?.comment) return undefined;
    const emails = extractMentionedEmails(item);
    const pings = await Promise.all(emails.map(getDiscordMention));
    const content = pings.filter((p): p is string => p !== null).join(" ");
    return content || undefined;
  }

  return undefined;
}

function buildEmbedForEvent(
  payload: ClickupWebhookPayload,
  taskName: string | null,
  taskUrl: string
): DiscordEmbed | null {
  if (payload.event === "taskCommentPosted") {
    const item = payload.history_items[0];
    if (!item?.comment) return null;

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
