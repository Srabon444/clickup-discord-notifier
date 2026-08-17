import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/session";

//! Next.js 16 renamed middleware.js -> proxy.js; same request-gating role.
//! Cookie-based session replaces Basic Auth — Basic Auth triggered the
//! browser's native credential popup on every page load, which read as
//! broken. A real login page (/) sets this cookie instead; still a
//! lightweight gate (reuses DASHBOARD_PASSWORD as the HMAC secret, see
//! lib/session.ts), not a real session store.
export async function proxy(request: NextRequest) {
  const expectedPass = process.env.DASHBOARD_PASSWORD;
  const token = request.cookies.get("dashboard_session")?.value;

  if (expectedPass && token && (await verifySessionToken(token, expectedPass))) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/", request.url);
  loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: "/dashboard/:path*",
};
