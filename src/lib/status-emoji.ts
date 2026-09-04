//! Shared by build-notification.ts (live tickets-channel embeds) and
//! week-coverage.ts (/tickets-list, /tickets-all) so both surfaces show the
//! same dot for the same status.

//! Exact mapping for this workspace's known statuses, per the ClickUp status
//! dropdown colors — "ready for uat" and "complete" are both ClickUp green
//! but visually distinct there (dark vs light), so they get different emoji
//! rather than collapsing to the same dot.
const STATUS_EMOJI_BY_NAME: Record<string, string> = {
  "in progress": "🔵",
  "fix / amend": "🔴",
  "ready for review": "🟠",
  "ready for deployment": "🟡",
  "ready for uat": "🟢",
  complete: "🟩",
};

const COLOR_PALETTE: Array<{ emoji: string; rgb: [number, number, number] }> = [
  { emoji: "🔴", rgb: [237, 28, 36] },
  { emoji: "🟠", rgb: [255, 127, 0] },
  { emoji: "🟡", rgb: [255, 221, 0] },
  { emoji: "🟢", rgb: [0, 166, 81] },
  { emoji: "🔵", rgb: [0, 114, 206] },
  { emoji: "🟣", rgb: [146, 39, 143] },
  { emoji: "🟤", rgb: [139, 69, 19] },
  { emoji: "⚪", rgb: [220, 220, 220] },
  { emoji: "⚫", rgb: [35, 35, 35] },
];

//! Unlisted statuses fall back to bucketing ClickUp's free-form hex color to
//! the nearest emoji circle by RGB distance — Discord message text can't
//! render arbitrary colors directly.
export function statusEmoji(status: string, color: string | null | undefined): string {
  const byName = STATUS_EMOJI_BY_NAME[status.trim().toLowerCase()];
  if (byName) return byName;

  const hex = color?.replace("#", "");
  if (!hex || !/^[0-9a-fA-F]{6}$/.test(hex)) return "⚪";
  const rgb: [number, number, number] = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  return COLOR_PALETTE.reduce((best, c) => {
    const dist = (rgb[0] - c.rgb[0]) ** 2 + (rgb[1] - c.rgb[1]) ** 2 + (rgb[2] - c.rgb[2]) ** 2;
    const bestDist = (rgb[0] - best.rgb[0]) ** 2 + (rgb[1] - best.rgb[1]) ** 2 + (rgb[2] - best.rgb[2]) ** 2;
    return dist < bestDist ? c : best;
  }).emoji;
}
