import { NextResponse, type NextRequest } from "next/server";
import { triggerNotification } from "@/lib/trigger-notification";

export async function POST(req: NextRequest) {
  const { direction } = (await req.json().catch(() => ({}))) as { direction?: string };

  if (!direction || !["next", "current", "prev"].includes(direction)) {
    return NextResponse.json({ error: "Invalid direction. Use: next, current, or prev" }, { status: 400 });
  }

  const result = await triggerNotification(direction as "next" | "current" | "prev");
  return NextResponse.json(result);
}
