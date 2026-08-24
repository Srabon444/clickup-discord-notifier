import { NextResponse, type NextRequest } from "next/server";
import { triggerNotification } from "@/lib/trigger-notification";

//! Backup path for the GitHub Actions cron (queue delays there have pushed the
//! Friday post past 3PM Dhaka before) — Vercel invokes this on its own
//! schedule (see vercel.json). Posting twice if both fire is accepted, not a bug.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await triggerNotification("next");
  return NextResponse.json(result);
}
