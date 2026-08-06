export {};

import { createWebhook } from "../src/lib/clickup-client.ts";

const teamId = process.env.CLICKUP_TEAM_ID;
const endpoint = process.argv[2];

if (!teamId) {
  console.error("Missing CLICKUP_TEAM_ID (set it in .env.local)");
  process.exit(1);
}
if (!endpoint) {
  console.error("Usage: npm run register-webhook -- <production-url>/api/clickup-webhook");
  process.exit(1);
}

const webhook = await createWebhook(teamId, endpoint, [
  "taskCommentPosted",
  "taskAssigneeUpdated",
]);

console.log(`id: ${webhook.id}`);
console.log(`secret: ${webhook.secret}`);
