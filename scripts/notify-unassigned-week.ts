export {};

import { triggerNotification } from "../src/lib/trigger-notification.ts";

const args = process.argv.slice(2);

//! --include-parent mirrors the dashboard checkbox: off by default, so a
//! ticket that has subtasks doesn't count for whoever is assigned to the
//! parent. Pass the flag to get the old count-everything behaviour.
const includeParent = args.includes("--include-parent");
const direction = (args.find((a) => !a.startsWith("--")) ?? "next") as "next" | "current" | "prev";

if (!["next", "current", "prev"].includes(direction)) {
  console.error(`Invalid direction: ${direction}. Use: next, current, or prev`);
  process.exit(1);
}

const result = await triggerNotification(direction, includeParent);

if (!result.success) {
  console.error(result.message);
  process.exit(1);
}

console.log(`${result.message} — ${result.membersShown} member(s) shown, ${result.membersWithGap} with a gap.`);
