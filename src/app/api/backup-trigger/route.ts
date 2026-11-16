import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/session";

//! proxy.ts only gates /dashboard/*, so this route must check the session itself.
async function forward(req: NextRequest, path: "/trigger" | "/status", method: "GET" | "POST") {
  const expectedPass = process.env.DASHBOARD_PASSWORD;
  const token = req.cookies.get("dashboard_session")?.value;
  if (!expectedPass || !token || !(await verifySessionToken(token, expectedPass))) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const baseUrl = process.env.BACKUP_TRIGGER_URL;
  const secret = process.env.BACKUP_TRIGGER_SECRET;
  if (!baseUrl || !secret) {
    return NextResponse.json({ error: "Backup trigger is not configured" }, { status: 500 });
  }

  try {
    const r = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
  } catch (error) {
    return NextResponse.json(
      { error: `Backup service unreachable: ${error instanceof Error ? error.message : "unknown error"}` },
      { status: 502 },
    );
  }
}

export function POST(req: NextRequest) {
  return forward(req, "/trigger", "POST");
}

export function GET(req: NextRequest) {
  return forward(req, "/status", "GET");
}
