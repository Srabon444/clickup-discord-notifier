export {};

const token = process.env.CLICKUP_API_TOKEN;
if (!token) {
  console.error("Missing CLICKUP_API_TOKEN (set it in .env.local)");
  process.exit(1);
}

const res = await fetch("https://api.clickup.com/api/v2/team", {
  headers: { Authorization: token },
});

if (!res.ok) {
  console.error(`ClickUp API error ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const { teams } = await res.json();
for (const team of teams) {
  console.log(`${team.id}  ${team.name}`);
}
