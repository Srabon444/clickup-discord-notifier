import { describe, expect, test } from "vitest";
import {
  buildMemberCoverage,
  currentWeekdays,
  excludeParentTasks,
  parentIdsFromTasks,
  formatDayLines,
  formatTicketLine,
  isActiveStatus,
  nextWeekdays,
  prevWeekdays,
  sortTicketsByDate,
  taskCoversDay,
  taskCoversDayForReport,
  tasksCoveringWeek,
  type CoverageTask,
} from "./week-coverage";

function epoch(day: string): string {
  return String(new Date(`${day}T12:00:00+06:00`).getTime());
}

describe("isActiveStatus", () => {
  test("treats most statuses as active", () => {
    expect(isActiveStatus("In Progress")).toBe(true);
    expect(isActiveStatus("fix / amend")).toBe(true);
    expect(isActiveStatus("Inbox")).toBe(true);
    expect(isActiveStatus("To Do")).toBe(true);
    expect(isActiveStatus("ready for uat")).toBe(true);
    expect(isActiveStatus("Ready for Deployment")).toBe(true);
    expect(isActiveStatus("Ready for Review")).toBe(true);
  });

  test("rejects the parked/done statuses, case-insensitively", () => {
    expect(isActiveStatus("Complete")).toBe(false);
    expect(isActiveStatus("COMPLETE")).toBe(false);
    expect(isActiveStatus("  complete  ")).toBe(false);
    expect(isActiveStatus("On Hold")).toBe(false);
  });
});

describe("taskCoversDay", () => {
  const active = { status: { status: "in progress" } };
  const inactive = { status: { status: "complete" } };

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

describe("taskCoversDayForReport", () => {
  const complete = { status: { status: "complete" } };
  const onHold = { status: { status: "on hold" } };
  const active = { status: { status: "in progress" } };

  test("complete ticket covers today and earlier days in range", () => {
    const task: CoverageTask = { ...complete, start_date: epoch("2026-08-18"), due_date: epoch("2026-08-20") };
    const now = new Date("2026-08-20T10:00:00Z"); // today = 2026-08-20 in Asia/Dhaka
    expect(taskCoversDayForReport(task, "2026-08-19", now)).toBe(true);
    expect(taskCoversDayForReport(task, "2026-08-20", now)).toBe(true);
  });

  test("complete ticket does not cover a future day", () => {
    const task: CoverageTask = { ...complete, start_date: epoch("2026-08-18"), due_date: epoch("2026-08-21") };
    const now = new Date("2026-08-20T10:00:00Z");
    expect(taskCoversDayForReport(task, "2026-08-21", now)).toBe(false);
  });

  test("on hold never covers, regardless of date", () => {
    const task: CoverageTask = { ...onHold, start_date: epoch("2026-08-18"), due_date: epoch("2026-08-20") };
    const now = new Date("2026-08-25T10:00:00Z");
    expect(taskCoversDayForReport(task, "2026-08-19", now)).toBe(false);
  });

  test("active status covers regardless of date, same as taskCoversDay", () => {
    const task: CoverageTask = { ...active, start_date: epoch("2026-08-18"), due_date: epoch("2026-08-20") };
    const now = new Date("2026-08-14T10:00:00Z"); // before the range entirely
    expect(taskCoversDayForReport(task, "2026-08-19", now)).toBe(true);
  });

  test("out-of-range day never covers, even for a past complete ticket", () => {
    const task: CoverageTask = { ...complete, start_date: epoch("2026-08-18"), due_date: epoch("2026-08-20") };
    const now = new Date("2026-08-25T10:00:00Z");
    expect(taskCoversDayForReport(task, "2026-08-21", now)).toBe(false);
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

  test("on a Sunday, rolls forward to the upcoming work week", () => {
    // 2026-08-23 is a Sunday in Asia/Dhaka
    const days = currentWeekdays(new Date("2026-08-23T10:00:00Z"));
    expect(days.map((d) => d.date)).toEqual(["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"]);
  });

  test("on a Saturday, rolls forward to the upcoming work week", () => {
    // 2026-08-22 is a Saturday in Asia/Dhaka
    const days = currentWeekdays(new Date("2026-08-22T10:00:00Z"));
    expect(days.map((d) => d.date)).toEqual(["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"]);
  });
});

describe("prevWeekdays / nextWeekdays follow currentWeekdays", () => {
  test("on a Saturday, next is one week past the rolled-forward current week", () => {
    const now = new Date("2026-08-22T10:00:00Z"); // Saturday
    expect(nextWeekdays(now)[0].date).toBe("2026-08-31");
    expect(prevWeekdays(now)[0].date).toBe("2026-08-17"); // the week that just ended
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

  test("marks a completed ticket covered only for today-or-earlier days", () => {
    const now = new Date("2026-08-19T10:00:00Z"); // today = Wed 2026-08-19 in Asia/Dhaka
    const weekOf = currentWeekdays(now);
    const tasks: CoverageTask[] = [
      { status: { status: "complete" }, start_date: epoch("2026-08-17"), due_date: epoch("2026-08-21") },
    ];
    const coverage = buildMemberCoverage({ username: "sam", discordUserId: "999" }, tasks, weekOf, now);
    expect(formatDayLines(coverage.days)).toBe("Mon ✅  ·  Tue ✅  ·  Wed ✅  ·  Thu ❌  ·  Fri ❌");
  });
});

describe("sortTicketsByDate", () => {
  test("sorts dated tickets ascending by start_date, due_date as fallback key", () => {
    const c = epoch("2026-08-19");
    const a = epoch("2026-08-17");
    const b = epoch("2026-08-18");
    const status = { status: "to do" };
    const tickets = [
      { name: "C", url: "u", start_date: c, due_date: null, status },
      { name: "A", url: "u", start_date: a, due_date: null, status },
      { name: "B (due only)", url: "u", start_date: null, due_date: b, status },
    ];
    expect(sortTicketsByDate(tickets).map((t) => t.name)).toEqual(["A", "B (due only)", "C"]);
  });

  test("sinks undated tickets to the bottom, after every dated ticket", () => {
    const status = { status: "to do" };
    const tickets = [
      { name: "no date", url: "u", start_date: null, due_date: null, status },
      { name: "dated", url: "u", start_date: epoch("2026-08-17"), due_date: null, status },
    ];
    expect(sortTicketsByDate(tickets).map((t) => t.name)).toEqual(["dated", "no date"]);
  });
});

describe("formatTicketLine", () => {
  test("shows a start→due range when both dates are present", () => {
    const line = formatTicketLine({
      name: "Fix bug",
      url: "https://app.clickup.com/t/1",
      start_date: epoch("2026-08-17"),
      due_date: epoch("2026-08-19"),
      status: { status: "in progress", color: "#0072ce" },
    });
    expect(line).toBe("• **Fix bug** — https://app.clickup.com/t/1 [🔵 IN PROGRESS] (2026-08-17 → 2026-08-19)");
  });

  test("shows just the one date when only one is set", () => {
    const status = { status: "to do", color: null };
    expect(
      formatTicketLine({ name: "T", url: "u", start_date: epoch("2026-08-17"), due_date: null, status })
    ).toBe("• **T** — u [⚪ TO DO] (from 2026-08-17)");
    expect(
      formatTicketLine({ name: "T", url: "u", start_date: null, due_date: epoch("2026-08-19"), status })
    ).toBe("• **T** — u [⚪ TO DO] (due 2026-08-19)");
  });

  test("omits the date suffix but keeps the status bracket when neither date is set", () => {
    expect(
      formatTicketLine({ name: "T", url: "u", start_date: null, due_date: null, status: { status: "complete", color: "#008844" } })
    ).toBe("• **T** — u [🟩 COMPLETE]");
  });

  test("falls back to a gray dot for a missing or malformed color on an unknown status", () => {
    expect(formatTicketLine({ name: "T", url: "u", start_date: null, due_date: null, status: { status: "custom", color: "not-a-hex" } })).toBe(
      "• **T** — u [⚪ CUSTOM]"
    );
  });

  test("uses the exact emoji for every known workspace status, case-insensitively", () => {
    const cases: Array<[string, string]> = [
      ["In Progress", "🔵"],
      ["Fix / Amend", "🔴"],
      ["Ready for Review", "🟠"],
      ["Ready for Deployment", "🟡"],
      ["Ready for UAT", "🟢"],
      ["Complete", "🟩"],
    ];
    for (const [status, emoji] of cases) {
      const line = formatTicketLine({ name: "T", url: "u", start_date: null, due_date: null, status: { status, color: null } });
      expect(line).toBe(`• **T** — u [${emoji} ${status.toUpperCase()}]`);
    }
  });
});

describe("parent-ticket exclusion", () => {
  const tasks = [
    { id: "leaf", parent: null },
    { id: "umbrella", parent: null },
    { id: "child", parent: "umbrella" },
    { id: "midlevel", parent: "umbrella" },
    { id: "grandchild", parent: "midlevel" },
  ];

  test("free pre-pass finds every id some task points at as its parent", () => {
    expect(parentIdsFromTasks(tasks)).toEqual(new Set(["umbrella", "midlevel"]));
  });

  test("drops parents at every level, keeps leaves", () => {
    const kept = excludeParentTasks(tasks, parentIdsFromTasks(tasks)).map((t) => t.id);
    expect(kept).toEqual(["leaf", "child", "grandchild"]);
  });

  test("a parent whose only subtask is invisible to the fetch still drops once resolved via the API", () => {
    //! The pre-pass can't see it — this is the case getTask(id, true) covers.
    const hidden = [{ id: "umbrella", parent: null }];
    expect(parentIdsFromTasks(hidden).has("umbrella")).toBe(false);
    expect(excludeParentTasks(hidden, new Set(["umbrella"]))).toEqual([]);
  });

  test("keeps everything when no parent ids are supplied (includeParent path)", () => {
    expect(excludeParentTasks(tasks, new Set()).map((t) => t.id)).toEqual(tasks.map((t) => t.id));
  });
});
