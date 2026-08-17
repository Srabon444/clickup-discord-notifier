export {};

const appId = process.env.DISCORD_APPLICATION_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;

if (!appId || !guildId || !botToken) {
  console.error("Missing DISCORD_APPLICATION_ID, DISCORD_GUILD_ID, or DISCORD_BOT_TOKEN");
  process.exit(1);
}

//! Guild-scoped (not global) registration — propagates instantly, global
//! commands can take up to an hour to show up.
const res = await fetch(`https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`, {
  method: "POST",
  headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "tickets-list",
    description: "See your active tickets for this week (Mon-Fri)",
    type: 1,
  }),
});

if (!res.ok) {
  console.error(`Failed to register command: ${res.status} ${await res.text()}`);
  process.exit(1);
}

const command = await res.json();
console.log(`Registered /${command.name} (id: ${command.id}) for guild ${guildId}`);
