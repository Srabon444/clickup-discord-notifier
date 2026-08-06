const CLICKUP_API = "https://api.clickup.com/api/v2";

function authHeaders() {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) throw new Error("Missing CLICKUP_API_TOKEN");
  return { Authorization: token };
}

export type ClickupTask = {
  id: string;
  name: string;
  url: string;
  assignees: Array<{ id: number; username: string; email: string }>;
};

export type ClickupWebhook = {
  id: string;
  endpoint: string;
  events: string[];
  health: { status: string; fail_count: number };
  secret: string;
};

export type ClickupMember = {
  id: number;
  username: string;
  email: string;
};

//! The ONLY file allowed to call api.clickup.com. Read-only task lookups plus
//! webhook management (create/list/delete), scoped only to the /webhook
//! endpoint — this manages our own subscription, it never touches a task,
//! comment, or assignee. Never add a call that writes one — see the
//! read-only-guard test next to this file.
export async function getTask(taskId: string): Promise<ClickupTask> {
  const res = await fetch(`${CLICKUP_API}/task/${taskId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`ClickUp getTask(${taskId}) failed: ${res.status}`);
  }
  return res.json();
}

export async function getTeamMembers(teamId: string): Promise<ClickupMember[]> {
  const res = await fetch(`${CLICKUP_API}/team`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`ClickUp getTeamMembers failed: ${res.status}`);
  }
  const body = await res.json();
  const team = body.teams.find((t: { id: string }) => t.id === teamId);
  return (team?.members ?? []).map((m: { user: ClickupMember }) => m.user);
}

export async function createWebhook(
  teamId: string,
  endpoint: string,
  events: string[]
): Promise<ClickupWebhook> {
  const res = await fetch(`${CLICKUP_API}/team/${teamId}/webhook`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint, events }),
  });
  if (!res.ok) {
    throw new Error(`ClickUp createWebhook failed: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  return body.webhook;
}

export async function listWebhooks(teamId: string): Promise<ClickupWebhook[]> {
  const res = await fetch(`${CLICKUP_API}/team/${teamId}/webhook`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`ClickUp listWebhooks failed: ${res.status}`);
  }
  const body = await res.json();
  return body.webhooks;
}

export async function updateWebhook(
  webhookId: string,
  endpoint: string,
  events: string[]
): Promise<ClickupWebhook> {
  const res = await fetch(`${CLICKUP_API}/webhook/${webhookId}`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint, events, status: "active" }),
  });
  if (!res.ok) {
    throw new Error(`ClickUp updateWebhook(${webhookId}) failed: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  return body.webhook;
}

export async function deleteWebhook(webhookId: string): Promise<void> {
  const res = await fetch(`${CLICKUP_API}/webhook/${webhookId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`ClickUp deleteWebhook(${webhookId}) failed: ${res.status}`);
  }
}
