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
};

//! The ONLY file allowed to call api.clickup.com. Read-only task lookups now;
//! webhook create/list/delete calls get added in Phase 5 (scoped to the
//! /webhook endpoint only). Never add a call that writes a task, comment, or
//! assignee — see the read-only-guard test next to this file.
export async function getTask(taskId: string): Promise<ClickupTask> {
  const res = await fetch(`${CLICKUP_API}/task/${taskId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`ClickUp getTask(${taskId}) failed: ${res.status}`);
  }
  return res.json();
}
