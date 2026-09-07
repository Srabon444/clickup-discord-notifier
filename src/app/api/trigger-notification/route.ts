import { NextResponse, type NextRequest } from "next/server";
import { triggerNotification } from "@/lib/trigger-notification";

export async function POST(req: NextRequest) {
  const { direction, includeParent } = (await req.json().catch(() => ({}))) as {
    direction?: string;
    includeParent?: unknown;
  };

  if (!direction || !["next", "current", "prev"].includes(direction)) {
    return NextResponse.json({ error: "Invalid direction. Use: next, current, or prev" }, { status: 400 });
  }

  //! Validated here, not just in the dashboard checkbox — this route is
  //! reachable with any JSON body, and a truthy string would silently flip
  //! the report's meaning.
  if (includeParent !== undefined && typeof includeParent !== "boolean") {
    return NextResponse.json({ error: "includeParent must be a boolean" }, { status: 400 });
  }

  const result = await triggerNotification(direction as "next" | "current" | "prev", includeParent === true);
  return NextResponse.json(result);
}
