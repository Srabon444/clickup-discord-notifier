import { NextResponse, type NextRequest } from "next/server";
import { getFilteredTeamTasks } from "@/lib/clickup-client";
import { verifyDiscordSignature } from "@/lib/discord-verify";
import { checkAndIncrementUsage } from "@/lib/rate-limit";
import { supabaseServer } from "@/lib/supabase-server";
import { currentWeekdays, tasksCoveringWeek } from "@/lib/week-coverage";

const COMMAND_NAME = "tickets-list";

type DiscordInteraction = {
  type: number;
  member?: { user?: { id: string } };
  user?: { id: string };
  data?: { name: string };
};

function ephemeral(content: string) {
  return NextResponse.json({ type: 4, data: { content, flags: 64 } });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  const publicKey = process.env.DISCORD_PUBLIC_KEY;

  //! Debug: log Discord's PING request to spot signature mismatch
  if (signature && timestamp) {
    console.log("[DISCORD PING]", {
      sig: signature?.slice(0, 20),
      ts: timestamp,
      pubkey: publicKey?.slice(0, 20),
      bodyLen: rawBody.length,
      bodyStart: rawBody.slice(0, 50),
    });
  }

  if (!publicKey || !verifyDiscordSignature(rawBody, signature, timestamp, publicKey)) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  const interaction = JSON.parse(rawBody) as DiscordInteraction;

  if (interaction.type === 1) {
    return NextResponse.json({ type: 1 }); // PING -> PONG
  }

  if (interaction.type === 2 && interaction.data?.name === COMMAND_NAME) {
    return handleTicketsList(interaction);
  }

  return ephemeral("Unknown command.");
}

async function handleTicketsList(interaction: DiscordInteraction) {
  const discordUserId = interaction.member?.user?.id ?? interaction.user?.id;
  if (!discordUserId) return ephemeral("Couldn't identify you — try again.");

  const { data: mapping } = await supabaseServer
    .from("clickup_users")
    .select("clickup_user_id")
    .eq("discord_user_id", discordUserId)
    .maybeSingle();

  if (!mapping) {
    return ephemeral("Your Discord account isn't linked to a ClickUp account. Ask an admin to set up the mapping.");
  }

  let usage;
  try {
    usage = await checkAndIncrementUsage(discordUserId);
  } catch {
    return ephemeral("Something went wrong checking your usage limit. Try again shortly.");
  }
  //! Rejected here, before any ClickUp call — a spammer never costs an API call.
  if (!usage.allowed) {
    return ephemeral("⏳ You've hit today's limit (3/day) for this command. Try again tomorrow.");
  }

  const teamId = process.env.CLICKUP_TEAM_ID;
  if (!teamId) return ephemeral("Server misconfiguration — missing CLICKUP_TEAM_ID.");

  const weekdays = currentWeekdays();
  const rangeLabel = `${weekdays[0].date} – ${weekdays[4].date}`;

  let tickets;
  try {
    const tasks = await getFilteredTeamTasks(teamId, [Number(mapping.clickup_user_id)]);
    tickets = tasksCoveringWeek(tasks, weekdays);
  } catch {
    return ephemeral("Couldn't reach ClickUp right now. Try again shortly.");
  }

  if (tickets.length === 0) {
    return ephemeral(`📋 **Your tickets this week (${rangeLabel})**\n\nNo active tickets scheduled.`);
  }

  const lines = tickets.map((t) => `• **${t.name}** — ${t.url}`).join("\n");
  return ephemeral(`📋 **Your tickets this week (${rangeLabel})**\n\n${lines}`);
}
