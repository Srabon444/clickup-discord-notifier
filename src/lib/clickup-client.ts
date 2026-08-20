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

export type ClickupTaskWithDates = {
  id: string;
  name: string;
  url: string;
  start_date: string | null;
  due_date: string | null;
  status: { status: string; type: string };
  assignees: Array<{ id: number; username: string; email: string }>;
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

const MAX_PAGES = 50; // 5000 tasks — a sane ceiling, not a real workspace limit

//! ClickUp paginates this endpoint but doesn't return a last_page flag, and
//! with a multi-value assignees[] filter a page can come back SHORT (e.g.
//! 84 of 100) without being the last one — verified empirically: page 0 had
//! 84, page 1 had another 94, page 4 had just 3, page 5 was finally empty.
//! Stopping at the first short page (the old check) silently dropped ~75%
//! of real tasks. Only an empty page means done.
//! Deliberately doesn't filter by due_date_gt/lt: a null due_date behaves
//! unreliably under those filters, and start_date has no filter at all — so
//! date-range filtering happens client-side (see week-coverage.ts) against
//! the full task list.
export async function getFilteredTeamTasks(
  teamId: string,
  assigneeIds: number[]
): Promise<ClickupTaskWithDates[]> {
  const tasks: ClickupTaskWithDates[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    //! include_closed must be true — ClickUp's "closed" tasks are exactly the
    //! complete/done ones, and the weekly report needs those fetched so a
    //! complete ticket can still count as covered for today-or-earlier days
    //! (see taskCoversDayForReport in week-coverage.ts). "false" here silently
    //! dropped every complete ticket before that logic ever saw it.
    const params = new URLSearchParams({ include_closed: "true", subtasks: "true", page: String(page) });
    for (const id of assigneeIds) params.append("assignees[]", String(id));

    const res = await fetch(`${CLICKUP_API}/team/${teamId}/task?${params}`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      throw new Error(`ClickUp getFilteredTeamTasks failed: ${res.status}`);
    }
    const body = await res.json();
    const pageTasks: ClickupTaskWithDates[] = body.tasks ?? [];
    if (pageTasks.length === 0) break;
    tasks.push(...pageTasks);
  }
  return tasks;
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
