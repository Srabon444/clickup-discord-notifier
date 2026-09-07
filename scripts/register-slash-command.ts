export {};

const appId = process.env.DISCORD_APPLICATION_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;

if (!appId || !guildId || !botToken) {
  console.error("Missing DISCORD_APPLICATION_ID, DISCORD_GUILD_ID, or DISCORD_BOT_TOKEN");
  process.exit(1);
}

//! Type 6 is USER — Discord renders its own member picker with typeahead, so
//! no autocomplete handler is needed on our side. Optional: a bare
//! /tickets-list still answers about the caller.
const USER_OPTION = {
  name: "user",
  description: "Whose tickets to show — leave empty for your own",
  type: 6,
  required: false,
};

const commands = [
  { name: "tickets-list", description: "See active tickets for this week (Mon-Fri)", type: 1, options: [USER_OPTION] },
  { name: "tickets-all", description: "See all active tickets, dated or not", type: 1, options: [USER_OPTION] },
];

//! Guild-scoped (not global) registration — propagates instantly, global
//! commands can take up to an hour to show up. Posting an existing name
//! updates that command in place, so re-running this is safe.
for (const command of commands) {
  const res = await fetch(`https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`, {
    method: "POST",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });

  if (!res.ok) {
    console.error(`Failed to register command ${command.name}: ${res.status} ${await res.text()}`);
    process.exit(1);
  }

  const registered = await res.json();
  console.log(`Registered /${registered.name} (id: ${registered.id}) for guild ${guildId}`);
}
