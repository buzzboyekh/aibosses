// LINE webhook endpoint. Drop-in for Next.js App Router.
//
// Three rules this file exists to enforce:
//  1. Verify the signature over the RAW body, before parsing.
//  2. Return 200 immediately. LINE retries non-200, which double-processes.
//  3. Do the slow work (LLM, DB) after the response, never inside it.

import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "../../../../context/buildContext";
import { handlePostback, handleText } from "../../../../line/handlers";
import { verifyLineSignature } from "../../../../line/verify";

export const runtime = "nodejs"; // node:crypto + service key: never edge/browser

export async function POST(req: NextRequest) {
  const raw = await req.text(); // raw body, not req.json()
  const signature = req.headers.get("x-line-signature");
  const secret = process.env.LINE_CHANNEL_SECRET ?? "";

  if (!verifyLineSignature(raw, signature, secret)) {
    console.error("[line] bad signature");
    return new NextResponse("bad signature", { status: 401 });
  }

  let body: { events?: Array<Record<string, any>> };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true }); // malformed: ack, do not retry
  }

  const events = body.events ?? [];
  const ownerUserId = process.env.LINE_OWNER_USER_ID ?? null;

  // Fire and forget: the response must not wait on agent work.
  void (async () => {
    const db = serverDb();
    for (const event of events) {
      try {
        if (event.type === "postback" && event.postback?.data) {
          if (ownerUserId && event.source?.userId !== ownerUserId) {
            console.warn("[line] postback from non-owner, ignored");
            continue; // only the operator may approve
          }
          await handlePostback(db, ownerUserId ?? event.source.userId, event.postback.data);
        } else if (event.type === "message" && event.message?.type === "text") {
          await handleText(event.source?.userId, event.message.text, ownerUserId);
        }
      } catch (err) {
        console.error("[line] event handler failed", err);
      }
    }
  })();

  return NextResponse.json({ ok: true });
}

// LINE's console "Verify" button sends a GET to check the URL is reachable.
export async function GET() {
  return NextResponse.json({ ok: true });
}
