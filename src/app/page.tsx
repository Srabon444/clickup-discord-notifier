import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionToken } from "@/lib/session";
import { LoginForm } from "./login-form";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect: redirectParam } = await searchParams;
  const redirectTo = redirectParam || "/dashboard";

  const cookieStore = await cookies();
  const token = cookieStore.get("dashboard_session")?.value;
  const expectedPass = process.env.DASHBOARD_PASSWORD;

  if (token && expectedPass && (await verifySessionToken(token, expectedPass))) {
    redirect(redirectTo);
  }

  return <LoginForm redirectTo={redirectTo} />;
}
