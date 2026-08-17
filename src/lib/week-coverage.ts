const DHAKA_TZ = "Asia/Dhaka";

//! Exact literal status strings currently in use in this workspace (captured
//! from a real GET /team/{id}/task response) — ClickUp's own status "type"
//! (open/custom/unstarted/done) doesn't line up with what counts as active
//! work here (e.g. "on hold" is type=unstarted, "ready for uat" is type=done,
//! neither should count), so this matches on the literal status name.
const ACTIVE_STATUSES = new Set(["inbox", "to do", "in progress", "fix / amend"]);

export function isActiveStatus(status: string): boolean {
  return ACTIVE_STATUSES.has(status.trim().toLowerCase());
}

export type CoverageTask = {
  start_date: string | null;
  due_date: string | null;
  status: { status: string };
};

function epochToDhakaDate(epochMs: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: DHAKA_TZ }).format(new Date(Number(epochMs)));
}

//! A task with only one of start_date/due_date covers just that single
//! calendar day — the one concrete date it actually has — never an
//! open-ended range in either direction.
export function taskCoversDay(task: CoverageTask, day: string): boolean {
  if (!isActiveStatus(task.status.status)) return false;
  const start = task.start_date ? epochToDhakaDate(task.start_date) : null;
  const due = task.due_date ? epochToDhakaDate(task.due_date) : null;
  if (start && due) return start <= day && day <= due;
  if (due) return day === due;
  if (start) return day === start;
  return false;
}

export type Weekday = { date: string; label: string };

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function weekdaysFrom(monday: Date): Weekday[] {
  return WEEKDAY_LABELS.map((label, i) => {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), label };
  });
}

function todayInDhaka(now: Date): Date {
  const todayDhaka = new Intl.DateTimeFormat("en-CA", { timeZone: DHAKA_TZ }).format(now);
  return new Date(`${todayDhaka}T00:00:00Z`);
}

//! Always resolves to a Monday strictly after "now" in Asia/Dhaka — run on a
//! Monday itself, this still targets next week (not today), so a manual test
//! run on any day of the week lands on a sensible 5-day window.
export function nextWeekdays(now: Date = new Date()): Weekday[] {
  const today = todayInDhaka(now);
  const daysUntilMonday = ((1 - today.getUTCDay() + 7) % 7) || 7;
  const monday = new Date(today);
  monday.setUTCDate(monday.getUTCDate() + daysUntilMonday);
  return weekdaysFrom(monday);
}

//! The Monday of the current week — may be in the past relative to "now"
//! (e.g. run on a Thursday, Monday/Tuesday/Wednesday are already gone) —
//! the full Mon-Fri window is still returned, not just the remaining days.
export function currentWeekdays(now: Date = new Date()): Weekday[] {
  const today = todayInDhaka(now);
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  const monday = new Date(today);
  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday);
  return weekdaysFrom(monday);
}

//! The Monday of the week before the current week.
export function prevWeekdays(now: Date = new Date()): Weekday[] {
  const current = currentWeekdays(now);
  const prevMonday = new Date(`${current[0].date}T00:00:00Z`);
  prevMonday.setUTCDate(prevMonday.getUTCDate() - 7);
  return weekdaysFrom(prevMonday);
}

export function weekdaysByDirection(direction: "next" | "current" | "prev", now: Date = new Date()): Weekday[] {
  if (direction === "next") return nextWeekdays(now);
  if (direction === "current") return currentWeekdays(now);
  if (direction === "prev") return prevWeekdays(now);
  throw new Error(`Unknown direction: ${direction}`);
}

export type MemberCoverage = {
  username: string;
  discordUserId: string;
  days: Array<{ label: string; date: string; covered: boolean }>;
};

//! Only called with members that already have a discord_user_id — someone
//! ClickUp knows about but Discord doesn't can't be mentioned, so the caller
//! filters them out before this point rather than this function guessing
//! what to show for them.
export function buildMemberCoverage(
  member: { username: string; discordUserId: string },
  tasks: CoverageTask[],
  weekdays: Weekday[]
): MemberCoverage {
  return {
    username: member.username,
    discordUserId: member.discordUserId,
    days: weekdays.map((w) => ({
      label: w.label,
      date: w.date,
      covered: tasks.some((t) => taskCoversDay(t, w.date)),
    })),
  };
}

//! Side-by-side on one line, per the requested layout — not stacked one
//! day per line. Joined with a visible middle dot, not plain spaces: Discord
//! collapses runs of plain spaces, which made the icons visually run together.
export function formatDayLines(days: MemberCoverage["days"]): string {
  return days.map((d) => `${d.label} ${d.covered ? "✅" : "❌"}`).join("  ·  ");
}

export function tasksCoveringWeek<T extends CoverageTask>(tasks: T[], weekdays: Weekday[]): T[] {
  return tasks.filter((t) => weekdays.some((w) => taskCoversDay(t, w.date)));
}
