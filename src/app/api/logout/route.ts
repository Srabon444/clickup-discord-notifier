import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set("dashboard_session", "", { path: "/", maxAge: 0 });
  return res;
}
