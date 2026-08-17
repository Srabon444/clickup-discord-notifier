import { describe, expect, test } from "vitest";
import {
  buildMemberCoverage,
  currentWeekdays,
  formatDayLines,
  isActiveStatus,
  nextWeekdays,
  taskCoversDay,
  tasksCoveringWeek,
  type CoverageTask,
} from "./week-coverage";

function epoch(day: string): string {
  return String(new Date(`${day}T12:00:00+06:00`).getTime());
}

describe("isActiveStatus", () => {
  test("matches this workspace's active-work statuses case-insensitively", () => {
    expect(isActiveStatus("In Progress")).toBe(true);
    expect(isActiveStatus("fix / amend")).toBe(true);
    expect(isActiveStatus("Inbox")).toBe(true);
    expect(isActiveStatus("To Do")).toBe(true);
  });

  test("rejects statuses outside the allowlist", () => {
    expect(isActiveStatus("on hold")).toBe(false);
    expect(isActiveStatus("ready for uat")).toBe(false);
    expect(isActiveStatus("ready for review")).toBe(false);
    expect(isActiveStatus("ready for deployment")).toBe(false);
  });
});

describe("taskCoversDay", () => {
  const active = { status: { status: "in progress" } };
  const inactive = { status: { status: "on hold" } };

  test("covers every day inside a start/due range", () => {
    const task: CoverageTask = { ...active, start_date: epoch("2026-08-18"), due_date: epoch("2026-08-20") };
    expect(taskCoversDay(task, "2026-08-18")).toBe(true);
    expect(taskCoversDay(task, "2026-08-19")).toBe(true);
    expect(taskCoversDay(task, "2026-08-20")).toBe(true);
    expect(taskCoversDay(task, "2026-08-21")).toBe(false);
  });

  test("due date only covers just that day", () => {
    const task: CoverageTask = { ...active, start_date: null, due_date: epoch("2026-08-20") };
    expect(taskCoversDay(task, "2026-08-19")).toBe(false);
    expect(taskCoversDay(task, "2026-08-20")).toBe(true);
  });

  test("start date only covers just that day", () => {
    const task: CoverageTask = { ...active, start_date: epoch("2026-08-18"), due_date: null };
    expect(taskCoversDay(task, "2026-08-18")).toBe(true);
    expect(taskCoversDay(task, "2026-08-19")).toBe(false);
  });

  test("inactive status never covers, even with a matching range", () => {
    const task: CoverageTask = { ...inactive, start_date: epoch("2026-08-18"), due_date: epoch("2026-08-20") };
    expect(taskCoversDay(task, "2026-08-19")).toBe(false);
  });

  test("no dates at all never covers", () => {
    expect(taskCoversDay({ ...active, start_date: null, due_date: null }, "2026-08-19")).toBe(false);
  });
});

describe("nextWeekdays", () => {
  test("from a Friday, targets the Monday 3 days later", () => {
    // 2026-08-14 is a Friday in Asia/Dhaka
    const days = nextWeekdays(new Date("2026-08-14T10:00:00Z"));
    expect(days.map((d) => d.date)).toEqual(["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21"]);
    expect(days.map((d) => d.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  });

  test("from a Monday, still targets next week's Monday, not today", () => {
    // 2026-08-17 is a Monday in Asia/Dhaka
    const days = nextWeekdays(new Date("2026-08-17T10:00:00Z"));
    expect(days[0].date).toBe("2026-08-24");
  });
});

describe("currentWeekdays", () => {
  test("mid-week, still returns the full Mon-Fri including already-past days", () => {
    // 2026-08-20 is a Thursday in Asia/Dhaka, in the week of Aug 17-21
    const days = currentWeekdays(new Date("2026-08-20T10:00:00Z"));
    expect(days.map((d) => d.date)).toEqual(["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21"]);
  });

  test("on a Monday, returns that same week", () => {
    const days = currentWeekdays(new Date("2026-08-17T10:00:00Z"));
    expect(days[0].date).toBe("2026-08-17");
  });

  test("on a Sunday, returns the week that just ended", () => {
    // 2026-08-23 is a Sunday in Asia/Dhaka
    const days = currentWeekdays(new Date("2026-08-23T10:00:00Z"));
    expect(days.map((d) => d.date)).toEqual(["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21"]);
  });
});

describe("tasksCoveringWeek", () => {
  const weekdays = currentWeekdays(new Date("2026-08-20T10:00:00Z"));

  test("keeps only tasks that cover at least one day in the window", () => {
    const inWindow: CoverageTask = {
      status: { status: "to do" },
      start_date: epoch("2026-08-19"),
      due_date: epoch("2026-08-19"),
    };
    const outOfWindow: CoverageTask = {
      status: { status: "to do" },
      start_date: epoch("2026-08-25"),
      due_date: epoch("2026-08-25"),
    };
    expect(tasksCoveringWeek([inWindow, outOfWindow], weekdays)).toEqual([inWindow]);
  });
});

describe("buildMemberCoverage / formatDayLines", () => {
  const weekdays = nextWeekdays(new Date("2026-08-14T10:00:00Z"));

  test("builds per-day coverage and formats it side by side on one line", () => {
    const tasks: CoverageTask[] = [
      { status: { status: "in progress" }, start_date: epoch("2026-08-17"), due_date: epoch("2026-08-19") },
    ];
    const coverage = buildMemberCoverage({ username: "sam", discordUserId: "999" }, tasks, weekdays);
    expect(coverage.username).toBe("sam");
    expect(coverage.discordUserId).toBe("999");
    expect(formatDayLines(coverage.days)).toBe("Mon ✅  ·  Tue ✅  ·  Wed ✅  ·  Thu ❌  ·  Fri ❌");
  });
});
