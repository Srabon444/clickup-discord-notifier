import type { DiscordEmbed } from "./discord";

export type ClickupUser = {
  id: number;
  username: string;
  email: string;
};

export type ClickupStatus = {
  status: string;
  color: string;
  type: string;
};

export type ClickupHistoryItem = {
  id: string;
  field: string;
  user: ClickupUser;
  before: unknown;
  after: unknown;
  date?: string; // epoch ms as a string

  comment?: {
    id: string;
    text_content: string;
    // A mention is a comment[] item with type "tag" and its own `user` —
    // confirmed from a real captured payload (ClickUp doesn't document this
    // shape publicly).
    comment: Array<{ text: string; type?: string; attributes?: Record<string, unknown>; user?: ClickupUser }>;
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

export function extractMentionedEmails(item: ClickupHistoryItem): string[] {
  const tags = item.comment?.comment.filter((part) => part.type === "tag" && part.user?.email) ?? [];
  return [...new Set(tags.map((tag) => tag.user!.email))];
}

export function findStatusChange(
  historyItems: ClickupHistoryItem[]
): { actor: ClickupUser; from: ClickupStatus; to: ClickupStatus } | null {
  const item = historyItems.find((i) => i.field === "status");
  if (!item || typeof item.after !== "object" || item.after === null) return null;
  return { actor: item.user, from: item.before as ClickupStatus, to: item.after as ClickupStatus };
}

const EMBED_COLOR = {
  comment: 0x5865f2,
  assignee: 0x57f287,
  statusFallback: 0x99aab5,
} as const;

const MAX_DESCRIPTION = 300;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function toTimestamp(dateMs: string | undefined): string | undefined {
  return dateMs ? new Date(Number(dateMs)).toISOString() : undefined;
}

function ticketLine(taskId: string): string {
  return `\n\nTicket: \`${taskId}\``;
}

function titleCase(text: string): string {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ClickUp's status color is a "#rrggbb" hex string; Discord embed color is a
// plain decimal int.
export function hexColorToInt(hex: string | undefined, fallback: number): number {
  const parsed = hex ? parseInt(hex.replace("#", ""), 16) : NaN;
  return Number.isNaN(parsed) ? fallback : parsed;
}

// Discord markdown has no background-color text span — a colored circle
// emoji next to the status name is the closest equivalent to ClickUp's
// colored status pill. Nearest-match by RGB distance against Discord's
// fixed set of circle emoji, so any ClickUp status color (not just the ones
// seen so far) maps to something reasonable.
const CIRCLE_EMOJI: Array<{ emoji: string; rgb: [number, number, number] }> = [
  { emoji: "🔴", rgb: [237, 28, 36] },
  { emoji: "🟠", rgb: [255, 127, 0] },
  { emoji: "🟡", rgb: [255, 221, 0] },
  { emoji: "🟢", rgb: [0, 166, 80] },
  { emoji: "🔵", rgb: [0, 120, 215] },
  { emoji: "🟣", rgb: [146, 39, 255] },
  { emoji: "🟤", rgb: [139, 69, 19] },
  { emoji: "⚫", rgb: [30, 30, 30] },
  { emoji: "⚪", rgb: [220, 220, 220] },
];

export function nearestCircleEmoji(hex: string | undefined): string {
  if (!hex || !/^#?[0-9a-f]{6}$/i.test(hex)) return "⚪";
  const clean = hex.replace("#", "");
  const rgb: [number, number, number] = [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];

  let closest = CIRCLE_EMOJI[0];
  let closestDistance = Infinity;
  for (const candidate of CIRCLE_EMOJI) {
    const distance = candidate.rgb.reduce((sum, c, i) => sum + (c - rgb[i]) ** 2, 0);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = candidate;
    }
  }
  return closest.emoji;
}

export function buildCommentEmbed(params: {
  taskId: string;
  taskName: string | null;
  taskUrl: string;
  commentText: string;
  authorUsername: string;
  date?: string;
}): DiscordEmbed {
  return {
    title: `💬 ${params.taskName ?? params.taskId}`,
    url: params.taskUrl,
    description: `**${params.authorUsername}** commented:\n> ${truncate(params.commentText, MAX_DESCRIPTION)}${ticketLine(params.taskId)}`,
    color: EMBED_COLOR.comment,
    timestamp: toTimestamp(params.date),
  };
}

export function buildAssigneeEmbed(params: {
  taskId: string;
  taskName: string | null;
  taskUrl: string;
  assigneeUsername: string;
  actorUsername: string;
  date?: string;
}): DiscordEmbed {
  return {
    title: `👀 ${params.taskName ?? params.taskId}`,
    url: params.taskUrl,
    description: `**${params.actorUsername}** assigned this to **${params.assigneeUsername}**${ticketLine(params.taskId)}`,
    color: EMBED_COLOR.assignee,
    timestamp: toTimestamp(params.date),
  };
}

export function buildStatusEmbed(params: {
  taskId: string;
  taskName: string | null;
  taskUrl: string;
  actorUsername: string;
  fromStatus: string;
  toStatus: string;
  toType: string;
  colorHex: string | undefined;
  date?: string;
}): DiscordEmbed {
  // ClickUp status "type" is "open" | "custom" | "closed" — "closed" is the
  // terminal/complete status regardless of what a team names it (Done,
  // Complete, Closed, ...), so match on type rather than the status string.
  const titleIcon = params.toType === "closed" ? "✅" : "🔄";
  return {
    title: `${titleIcon} ${params.taskName ?? params.taskId}`,
    url: params.taskUrl,
    description: `**${params.actorUsername}** changed status: ${titleCase(params.fromStatus)} → ${nearestCircleEmoji(params.colorHex)} **${titleCase(params.toStatus)}**${ticketLine(params.taskId)}`,
    color: hexColorToInt(params.colorHex, EMBED_COLOR.statusFallback),
    timestamp: toTimestamp(params.date),
  };
}
