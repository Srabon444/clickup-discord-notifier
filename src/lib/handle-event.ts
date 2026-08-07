import { getTask } from "./clickup-client";
import { postToDiscord } from "./discord";
import {
  buildAssigneeEmbed,
  buildCommentEmbed,
  buildDedupeKey,
  buildStatusEmbed,
  extractMentionedEmails,
  findAddedAssignee,
  findStatusChange,
  type ClickupWebhookPayload,
} from "./build-notification";
import type { DiscordEmbed } from "./discord";
import { supabaseServer } from "./supabase-server";
import { getDiscordMention } from "./user-mapping";

export async function handleClickupEvent(payload: ClickupWebhookPayload): Promise<void> {
  const dedupeKey = buildDedupeKey(payload);

  //! Reserve the dedupe row BEFORE posting to Discord, not after — ClickUp
  //! redelivers webhooks on timeout, and checking for duplicates only at
  //! log time (the old upsert+ignoreDuplicates approach) still sent the
  //! Discord message twice; only the second *log row* was silently dropped.
  const { error: insertError } = await supabaseServer.from("events").insert({
    event_type: payload.event,
    task_id: payload.task_id,
    task_name: null,
    dedupe_key: dedupeKey,
    raw_payload: payload,
    discord_status: "pending",
    error_message: null,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return; // already handled (or being handled) this exact redelivery
    }
    console.error("Failed to reserve dedupe row:", insertError.message);
  }

  let taskName: string | null = null;
  let taskUrl = `https://app.clickup.com/t/${payload.task_id}`;
  let assignees: Array<{ id: number; username: string; email: string }> = [];
  try {
    const task = await getTask(payload.task_id);
    taskName = task.name;
    taskUrl = task.url || taskUrl;
    assignees = task.assignees;
  } catch {
    //! Task lookup is best-effort context only — the notification still
    //! fires (with task_id as the title) if ClickUp's read API is down.
  }

  const embed = buildEmbedForEvent(payload, taskName, taskUrl);
  if (!embed) {
    // Nothing to notify about (e.g. assignee_remove-only) — drop the
    // reserved row rather than leaving a permanently "pending" log entry.
    await supabaseServer.from("events").delete().eq("dedupe_key", dedupeKey);
    return;
  }

  const result = await postToDiscord(
    embed,
    await buildMentionContent(payload, assignees),
    notifierUsername(payload)
  );

  await supabaseServer
    .from("events")
    .update({
      task_name: taskName,
      discord_status: result.ok ? "success" : "failed",
      error_message: result.ok ? null : result.error,
    })
    .eq("dedupe_key", dedupeKey);
}

async function buildMentionContent(
  payload: ClickupWebhookPayload,
  assignees: Array<{ id: number; username: string; email: string }>
): Promise<string | undefined> {
  if (payload.event === "taskAssigneeUpdated") {
    const assignee = findAddedAssignee(payload.history_items);
    return (await getDiscordMention(assignee?.email)) ?? undefined;
  }

  if (payload.event === "taskCommentPosted") {
    const item = payload.history_items[0];
    if (!item?.comment) return undefined;
    const emails = extractMentionedEmails(item);
    return joinPings(await Promise.all(emails.map(getDiscordMention)));
  }

  if (payload.event === "taskStatusUpdated") {
    const change = findStatusChange(payload.history_items);
    if (!change) return undefined;
    // Only ping the assignee(s) when someone else changed the status — no
    // point notifying you that you changed your own ticket's status.
    const emails = assignees.filter((a) => a.id !== change.actor.id).map((a) => a.email);
    return joinPings(await Promise.all(emails.map(getDiscordMention)));
  }

  return undefined;
}

function joinPings(pings: Array<string | null>): string | undefined {
  const content = pings.filter((p): p is string => p !== null).join(" ");
  return content || undefined;
}

const EVENT_ICON: Record<string, string> = {
  taskCommentPosted: "💬",
  taskAssigneeUpdated: "✅",
  taskStatusUpdated: "🔄",
};

// Varying the displayed username per message breaks Discord's grouping (see
// the note in discord.ts) — ticket + event type differs for almost every
// real notification, so consecutive messages get their own visual block
// instead of collapsing into one cramped group.
function notifierUsername(payload: ClickupWebhookPayload): string {
  const icon = EVENT_ICON[payload.event] ?? "🔔";
  return `${icon} ${payload.task_id}`;
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
      date: item.date,
    });
  }

  if (payload.event === "taskAssigneeUpdated") {
    const assignee = findAddedAssignee(payload.history_items);
    if (!assignee) return null;
    const addItem = payload.history_items.find((item) => item.field === "assignee_add");

    return buildAssigneeEmbed({
      taskId: payload.task_id,
      taskName,
      taskUrl,
      assigneeUsername: assignee.username,
      actorUsername: addItem?.user.username ?? "someone",
      date: addItem?.date,
    });
  }

  if (payload.event === "taskStatusUpdated") {
    const change = findStatusChange(payload.history_items);
    if (!change) return null;
    const item = payload.history_items.find((i) => i.field === "status");

    return buildStatusEmbed({
      taskId: payload.task_id,
      taskName,
      taskUrl,
      actorUsername: change.actor.username,
      fromStatus: change.from.status,
      toStatus: change.to.status,
      toType: change.to.type,
      colorHex: change.to.color,
      date: item?.date,
    });
  }

  return null;
}
