import { NextResponse, after, type NextRequest } from "next/server";
import { verifyClickupSignature } from "@/lib/verify-signature";
import { handleClickupEvent } from "@/lib/handle-event";
import type { ClickupWebhookPayload } from "@/lib/build-notification";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-signature");
  const secret = process.env.CLICKUP_WEBHOOK_SECRET;

  if (!secret || !verifyClickupSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as ClickupWebhookPayload;

  //! after() keeps the Discord POST + Supabase insert running past the
  //! response on Vercel's serverless runtime — a bare un-awaited promise can
  //! get frozen the moment we return.
  after(() => handleClickupEvent(payload));

  return NextResponse.json({ ok: true });
}
