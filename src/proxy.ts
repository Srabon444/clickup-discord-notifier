import { NextResponse, type NextRequest } from "next/server";

//! Next.js 16 renamed middleware.js -> proxy.js; same request-gating role.
//! Basic Auth is a lightweight gate (the dashboard URL is otherwise public),
//! not a real secret store — see the env var table in the project spec.
export function proxy(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedUser = process.env.DASHBOARD_USERNAME;
  const expectedPass = process.env.DASHBOARD_PASSWORD;

  if (authHeader?.startsWith("Basic ")) {
    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
    const separatorIndex = decoded.indexOf(":");
    const user = decoded.slice(0, separatorIndex);
    const pass = decoded.slice(separatorIndex + 1);
    if (user === expectedUser && pass === expectedPass) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Dashboard"' },
  });
}

export const config = {
  matcher: "/dashboard/:path*",
};
