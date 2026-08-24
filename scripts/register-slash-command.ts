export {};

const appId = process.env.DISCORD_APPLICATION_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;

if (!appId || !guildId || !botToken) {
  console.error("Missing DISCORD_APPLICATION_ID, DISCORD_GUILD_ID, or DISCORD_BOT_TOKEN");
  process.exit(1);
}

const commands = [
  { name: "tickets-list", description: "See your active tickets for this week (Mon-Fri)", type: 1 },
  { name: "tickets-all", description: "See all your active tickets, dated or not", type: 1 },
];

//! Guild-scoped (not global) registration — propagates instantly, global
//! commands can take up to an hour to show up.
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
