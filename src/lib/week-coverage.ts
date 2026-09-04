import { statusEmoji } from "./status-emoji";

const DHAKA_TZ = "Asia/Dhaka";

//! Policy: every status counts as active work except these — everything
//! else (in progress, to do, inbox, fix / amend, ready for uat, ready for
//! deployment, ready for review, ...) still covers a day; only these are
//! explicitly parked/done and don't.
const INACTIVE_STATUSES = new Set(["complete", "on hold"]);

export function isActiveStatus(status: string): boolean {
  return !INACTIVE_STATUSES.has(status.trim().toLowerCase());
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
function inDateRange(task: CoverageTask, day: string): boolean {
  const start = task.start_date ? epochToDhakaDate(task.start_date) : null;
  const due = task.due_date ? epochToDhakaDate(task.due_date) : null;
  if (start && due) return start <= day && day <= due;
  if (due) return day === due;
  if (start) return day === start;
  return false;
}

export function taskCoversDay(task: CoverageTask, day: string): boolean {
  if (!isActiveStatus(task.status.status)) return false;
  return inDateRange(task, day);
}

//! Weekly coverage report only — /tickets-list still uses taskCoversDay's
//! blanket complete-exclusion untouched. Here a complete ticket still counts
//! as covered for today-or-earlier days (the work happened); only a complete
//! ticket sitting on a future day means nothing's really scheduled that day.
export function taskCoversDayForReport(task: CoverageTask, day: string, now: Date = new Date()): boolean {
  if (!inDateRange(task, day)) return false;
  const status = task.status.status.trim().toLowerCase();
  if (status === "complete") return day <= new Intl.DateTimeFormat("en-CA", { timeZone: DHAKA_TZ }).format(now);
  return isActiveStatus(status);
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

//! The Monday of the current work week. On Sat/Sun this rolls forward to the
//! upcoming Mon-Fri instead of the week that just ended — the weekend
//! "belongs" to next week's planning, not last week's. Mon-Fri still returns
//! the full window even for already-past days (e.g. Thursday still shows Mon).
export function currentWeekdays(now: Date = new Date()): Weekday[] {
  const today = todayInDhaka(now);
  const dow = today.getUTCDay(); // 0=Sun..6=Sat
  const monday = new Date(today);
  if (dow === 0 || dow === 6) {
    monday.setUTCDate(monday.getUTCDate() + (dow === 6 ? 2 : 1));
  } else {
    monday.setUTCDate(monday.getUTCDate() - ((dow + 6) % 7));
  }
  return weekdaysFrom(monday);
}

//! Always one week after currentWeekdays's Monday — so on a weekend, "next"
//! is the week after the one "current" already rolled forward to.
export function nextWeekdays(now: Date = new Date()): Weekday[] {
  const current = currentWeekdays(now);
  const monday = new Date(`${current[0].date}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() + 7);
  return weekdaysFrom(monday);
}

//! Always one week before currentWeekdays's Monday.
export function prevWeekdays(now: Date = new Date()): Weekday[] {
  const current = currentWeekdays(now);
  const monday = new Date(`${current[0].date}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - 7);
  return weekdaysFrom(monday);
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
  weekdays: Weekday[],
  now: Date = new Date()
): MemberCoverage {
  return {
    username: member.username,
    discordUserId: member.discordUserId,
    days: weekdays.map((w) => ({
      label: w.label,
      date: w.date,
      covered: tasks.some((t) => taskCoversDayForReport(t, w.date, now)),
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

export type TicketDisplay = {
  name: string;
  url: string;
  start_date: string | null;
  due_date: string | null;
  status: { status: string; color?: string | null };
};

//! Sorted by start_date; a task with only a due_date sorts by that instead
//! (its due date is the only date it has). A task with neither date sinks to
//! the bottom, unordered among the rest of the undated tickets.
export function sortTicketsByDate<T extends TicketDisplay>(tickets: T[]): T[] {
  const sortKey = (t: T) => t.start_date ?? t.due_date;
  const dated = tickets.filter((t) => sortKey(t) !== null).sort((a, b) => Number(sortKey(a)) - Number(sortKey(b)));
  const undated = tickets.filter((t) => sortKey(t) === null);
  return [...dated, ...undated];
}


export function formatTicketLine(t: TicketDisplay): string {
  const start = t.start_date ? epochToDhakaDate(t.start_date) : null;
  const due = t.due_date ? epochToDhakaDate(t.due_date) : null;
  const dates = start && due ? `${start} → ${due}` : start ? `from ${start}` : due ? `due ${due}` : null;
  const statusTag = `[${statusEmoji(t.status.status, t.status.color)} ${t.status.status.toUpperCase()}]`;
  return dates ? `• **${t.name}** — ${t.url} ${statusTag} (${dates})` : `• **${t.name}** — ${t.url} ${statusTag}`;
}
