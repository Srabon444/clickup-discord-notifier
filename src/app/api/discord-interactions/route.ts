import { NextResponse, after, type NextRequest } from "next/server";
import { getFilteredTeamTasks } from "@/lib/clickup-client";
import { verifyDiscordSignature } from "@/lib/discord-verify";
import { checkAndIncrementUsage } from "@/lib/rate-limit";
import { supabaseServer } from "@/lib/supabase-server";
import { currentWeekdays, formatTicketLine, isActiveStatus, sortTicketsByDate, tasksCoveringWeek } from "@/lib/week-coverage";

const COMMAND_NAME = "tickets-list";
const COMMAND_NAME_ALL = "tickets-all";

type DiscordInteraction = {
  type: number;
  token: string;
  member?: { user?: { id: string } };
  user?: { id: string };
  data?: { name: string };
};

function ephemeral(content: string) {
  return NextResponse.json({ type: 4, data: { content, flags: 64 } });
}

//! SUPPRESS_EMBEDS — every ticket line carries its ClickUp URL, and without
//! this Discord auto-expands each one into a link-preview embed.
const SUPPRESS_EMBEDS = 1 << 2;

//! Edits the deferred response — the only way to answer once the initial
//! reply already committed to type 5 (DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE).
async function editDeferredReply(token: string, content: string) {
  const applicationId = process.env.DISCORD_APPLICATION_ID;
  if (!applicationId) return;
  const res = await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${token}/messages/@original`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, flags: SUPPRESS_EMBEDS }),
  });
  //! Discord silently rejects content over its 2000-char limit — without
  //! this check that failure was invisible and the interaction just sat on
  //! "thinking…" forever. See replyChunked, which exists to stay under it.
  if (!res.ok) console.error("Discord deferred-reply edit failed:", res.status, await res.text());
}

async function postFollowUp(token: string, content: string) {
  const applicationId = process.env.DISCORD_APPLICATION_ID;
  if (!applicationId) return;
  const res = await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, flags: 64 | SUPPRESS_EMBEDS }),
  });
  if (!res.ok) console.error("Discord follow-up message failed:", res.status, await res.text());
}

const DISCORD_CONTENT_LIMIT = 2000;

//! Greedily packs blocks (joined by newlines) into chunks that each fit
//! Discord's 2000-char message limit. A block that alone exceeds the limit
//! is left oversized rather than split mid-line — not a case that comes up
//! for a single ticket line in practice.
function chunkContent(blocks: string[], limit = DISCORD_CONTENT_LIMIT): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const block of blocks) {
    const candidate = current ? `${current}\n${block}` : block;
    if (candidate.length > limit && current) {
      chunks.push(current);
      current = block;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

//! First chunk edits the deferred reply; the rest post as follow-up
//! messages. Sent in order, one at a time — these are display order in the
//! channel, not independent writes, so they can't run concurrently.
async function replyChunked(token: string, header: string, lines: string[]) {
  const [first, ...rest] = chunkContent([header, "", ...lines]);
  await editDeferredReply(token, first);
  for (const chunk of rest) {
    await postFollowUp(token, chunk);
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  const publicKey = process.env.DISCORD_PUBLIC_KEY;

  if (!publicKey || !verifyDiscordSignature(rawBody, signature, timestamp, publicKey)) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  const interaction = JSON.parse(rawBody) as DiscordInteraction;

  if (interaction.type === 1) {
    return NextResponse.json({ type: 1 }); // PING -> PONG
  }

  if (interaction.type === 2 && interaction.data?.name === COMMAND_NAME) {
    //! Discord kills the interaction if the initial reply isn't sent within
    //! 3s — the actual work below (2 Supabase calls + a ClickUp fetch) can
    //! exceed that on a cold start, so acknowledge immediately (type 5) and
    //! do the real work in `after()`, then edit the deferred reply.
    after(() => resolveSafely(interaction, resolveTicketsList));
    return NextResponse.json({ type: 5, data: { flags: 64 } });
  }

  if (interaction.type === 2 && interaction.data?.name === COMMAND_NAME_ALL) {
    after(() => resolveSafely(interaction, resolveTicketsAll));
    return NextResponse.json({ type: 5, data: { flags: 64 } });
  }

  return ephemeral("Unknown command.");
}

//! Without this, any unhandled throw inside a resolve* function (bad
//! ClickUp/Supabase data shape, a network blip past its own try/catch)
//! leaves Discord showing "thinking…" forever — the deferred reply never
//! lands because nothing ever calls editDeferredReply.
async function resolveSafely(interaction: DiscordInteraction, resolve: (i: DiscordInteraction) => Promise<unknown>) {
  try {
    await resolve(interaction);
  } catch (err) {
    console.error("Unhandled error resolving interaction:", err);
    await editDeferredReply(interaction.token, "Something went wrong. Try again shortly.");
  }
}

type ResolvedCaller = { clickupUserId: number; teamId: string };

//! Shared by both commands: identify the caller, enforce the daily usage
//! cap, and check server config — before either command touches ClickUp.
async function resolveCaller(interaction: DiscordInteraction): Promise<ResolvedCaller | string> {
  const discordUserId = interaction.member?.user?.id ?? interaction.user?.id;
  if (!discordUserId) return "Couldn't identify you — try again.";

  const { data: mapping } = await supabaseServer
    .from("clickup_users")
    .select("clickup_user_id")
    .eq("discord_user_id", discordUserId)
    .maybeSingle();

  if (!mapping) {
    return "Your Discord account isn't linked to a ClickUp account. Ask an admin to set up the mapping.";
  }

  let usage;
  try {
    usage = await checkAndIncrementUsage(discordUserId);
  } catch {
    return "Something went wrong checking your usage limit. Try again shortly.";
  }
  //! Rejected here, before any ClickUp call — a spammer never costs an API call.
  if (!usage.allowed) {
    return "⏳ You've hit today's limit (10/day) for this command. Try again tomorrow.";
  }

  const teamId = process.env.CLICKUP_TEAM_ID;
  if (!teamId) return "Server misconfiguration — missing CLICKUP_TEAM_ID.";

  return { clickupUserId: Number(mapping.clickup_user_id), teamId };
}

async function resolveTicketsList(interaction: DiscordInteraction) {
  const reply = (content: string) => editDeferredReply(interaction.token, content);

  const caller = await resolveCaller(interaction);
  if (typeof caller === "string") return reply(caller);

  const weekdays = currentWeekdays();
  const rangeLabel = `${weekdays[0].date} – ${weekdays[4].date}`;

  let tickets;
  try {
    const tasks = await getFilteredTeamTasks(caller.teamId, [caller.clickupUserId]);
    tickets = sortTicketsByDate(tasksCoveringWeek(tasks, weekdays));
  } catch {
    return reply("Couldn't reach ClickUp right now. Try again shortly.");
  }

  if (tickets.length === 0) {
    return reply(`📋 **Your tickets this week (${rangeLabel})**\n\nNo active tickets scheduled.`);
  }

  return replyChunked(interaction.token, `📋 **Your tickets this week (${rangeLabel})**`, tickets.map(formatTicketLine));
}

//! Same active-status rule as /tickets-list (isActiveStatus), just without
//! the current-week date filter — every active ticket, dated or not.
async function resolveTicketsAll(interaction: DiscordInteraction) {
  const reply = (content: string) => editDeferredReply(interaction.token, content);

  const caller = await resolveCaller(interaction);
  if (typeof caller === "string") return reply(caller);

  let tickets;
  try {
    const tasks = await getFilteredTeamTasks(caller.teamId, [caller.clickupUserId]);
    tickets = sortTicketsByDate(tasks.filter((t) => isActiveStatus(t.status.status)));
  } catch {
    return reply("Couldn't reach ClickUp right now. Try again shortly.");
  }

  if (tickets.length === 0) {
    return reply("📋 **All your active tickets**\n\nNo active tickets.");
  }

  return replyChunked(interaction.token, "📋 **All your active tickets**", tickets.map(formatTicketLine));
}
