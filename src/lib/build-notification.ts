import type { DiscordEmbed } from "./discord";

export type ClickupUser = {
  id: number;
  username: string;
  email: string;
};

export type ClickupHistoryItem = {
  id: string;
  field: string;
  user: ClickupUser;
  before: unknown;
  after: unknown;
  comment?: {
    id: string;
    text_content: string;
    comment: Array<{ text: string; attributes?: Record<string, unknown> }>;
    user: ClickupUser;
  };
};

export type ClickupWebhookPayload = {
  event: string;
  webhook_id: string;
  task_id: string;
  history_items: ClickupHistoryItem[];
};

// dedupe_key: ClickUp can redeliver the same webhook — webhook_id + the
// history item's own id is the closest thing to an event identity in the
// documented payload shape (there's no single top-level event id).
export function buildDedupeKey(payload: ClickupWebhookPayload): string {
  const item = payload.history_items[0];
  return `${payload.webhook_id}:${item?.id ?? "unknown"}`;
}

// Only additions notify (per spec) — ClickUp emits one history item per
// assignee_add/assignee_remove, not a before/after list to diff.
export function findAddedAssignee(historyItems: ClickupHistoryItem[]): ClickupUser | null {
  const addItem = historyItems.find((item) => item.field === "assignee_add");
  if (!addItem || typeof addItem.after !== "object" || addItem.after === null) return null;
  return addItem.after as ClickupUser;
}

const EMBED_COLOR = {
  comment: 0x5865f2,
  assignee: 0x57f287,
} as const;

const MAX_DESCRIPTION = 300;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function buildCommentEmbed(params: {
  taskId: string;
  taskName: string | null;
  taskUrl: string;
  commentText: string;
  authorUsername: string;
}): DiscordEmbed {
  return {
    title: params.taskName ?? params.taskId,
    url: params.taskUrl,
    description: truncate(params.commentText, MAX_DESCRIPTION),
    color: EMBED_COLOR.comment,
    author: { name: `💬 ${params.authorUsername} commented` },
    footer: { text: `Ticket ${params.taskId}` },
  };
}

export function buildAssigneeEmbed(params: {
  taskId: string;
  taskName: string | null;
  taskUrl: string;
  assigneeUsername: string;
  actorUsername: string;
}): DiscordEmbed {
  return {
    title: params.taskName ?? params.taskId,
    url: params.taskUrl,
    description: `Assigned to **${params.assigneeUsername}**`,
    color: EMBED_COLOR.assignee,
    author: { name: `✅ ${params.actorUsername} assigned` },
    footer: { text: `Ticket ${params.taskId}` },
  };
}
