import { NextResponse, type NextRequest } from "next/server";
import { createSessionToken } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { username, password } = (await req.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
  };

  const expectedUser = process.env.DASHBOARD_USERNAME;
  const expectedPass = process.env.DASHBOARD_PASSWORD;

  if (!expectedUser || !expectedPass || username !== expectedUser || password !== expectedPass) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await createSessionToken(expectedPass);
  const res = NextResponse.json({ success: true });
  res.cookies.set("dashboard_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
