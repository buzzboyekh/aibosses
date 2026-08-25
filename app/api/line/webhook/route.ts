// LINE webhook endpoint. Drop-in for Next.js App Router.
//
// Three rules this file exists to enforce:
//  1. Verify the signature over the RAW body, before parsing.
//  2. Return 200 immediately. LINE retries non-200, which double-processes.
//  3. Do the slow work (LLM, DB) after the response, never inside it — but
//     hand it to waitUntil(), NOT a bare fire-and-forget promise. On Vercel
//     the function is frozen the moment the response is returned, so a
//     detached promise silently never runs. This cost us a debugging round:
//     the webhook logged a 200 and the approval stayed pending forever.

import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
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
  // Fail closed. With this unset, the old code treated every sender as the
  // owner and even replied to strangers with the id needed to take over.
  const ownerUserId = process.env.LINE_OWNER_USER_ID;
  if (!ownerUserId) {
    console.error("[line] LINE_OWNER_USER_ID unset — refusing to process events");
    return NextResponse.json({ ok: true });
  }

  const work = (async () => {
    const db = serverDb();
    for (const event of events) {
      try {
        if (event.type === "postback" && event.postback?.data) {
          if (event.source?.userId !== ownerUserId) {
            console.warn("[line] postback from non-owner, ignored");
            continue; // only the operator may approve
          }
          await handlePostback(db, ownerUserId, event.postback.data);
        } else if (event.type === "message" && event.message?.type === "text") {
          await handleText(db, event.source?.userId, event.message.text, ownerUserId);
        }
      } catch (err) {
        console.error("[line] event handler failed", err);
      }
    }
  })();

  // waitUntil keeps the instance alive until `work` settles while the 200 goes
  // out immediately. Outside Vercel it is unavailable, so fall back to await.
  try {
    waitUntil(work);
  } catch {
    await work;
  }

  return NextResponse.json({ ok: true });
}

// LINE's console "Verify" button sends a GET to check the URL is reachable.
export async function GET() {
  return NextResponse.json({ ok: true });
}
