export {};

import { listWebhooks } from "../src/lib/clickup-client.ts";

const teamId = process.env.CLICKUP_TEAM_ID;
const webhookId = process.env.CLICKUP_WEBHOOK_ID;
const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;

if (!teamId || !webhookId || !discordWebhookUrl) {
  console.error("Missing CLICKUP_TEAM_ID, CLICKUP_WEBHOOK_ID, or DISCORD_WEBHOOK_URL");
  process.exit(1);
}

async function alert(message: string) {
  await fetch(discordWebhookUrl!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: `⚠️ **ClickUp webhook watchdog**: ${message}` }),
  });
}

const webhooks = await listWebhooks(teamId);
const webhook = webhooks.find((w) => w.id === webhookId);

if (!webhook) {
  console.error(`Webhook ${webhookId} not found — it may have been deleted.`);
  await alert(`webhook \`${webhookId}\` no longer exists in ClickUp. Re-run \`npm run register-webhook\`.`);
  process.exit(1);
}

// Field name confirmed against a real GET /team/{id}/webhook response —
// "active" is healthy, anything else (e.g. "failing", "disabled") is not.
if (webhook.health.status !== "active") {
  console.error(`Webhook health: ${webhook.health.status} (fail_count: ${webhook.health.fail_count})`);
  await alert(
    `status is \`${webhook.health.status}\` (${webhook.health.fail_count} consecutive failures). Check the Vercel deployment.`
  );
  process.exit(1);
}

console.log(`Webhook ${webhookId} is healthy (status: active).`);
