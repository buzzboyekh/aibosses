// A supplier answers.
//
// Real inbound email would land here from a provider webhook (Resend, Postmark
// and similar POST the parsed message). Until that is wired, the same endpoint
// accepts a pasted reply, which is also how the demo drives it.

import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { serverDb } from "../../../context/buildContext";
import { ingestReply } from "../../../agents/reply";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const key = process.env.DASHBOARD_KEY;
  if (!key || req.headers.get("x-demo-key") !== key) {
    return new NextResponse("not found", { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const caseId = String(body.case ?? "").trim();
  const text = String(body.body ?? "").trim();
  if (!caseId || !text) {
    return NextResponse.json({ error: "case and body required" }, { status: 400 });
  }

  const db = serverDb();
  const result = await ingestReply(db, {
    caseId,
    from: String(body.from ?? "supplier"),
    body: text,
    ownerUserId: process.env.LINE_OWNER_USER_ID ?? null,
    force: Boolean(body.force),
  });

  // If it advanced, the next step may take a while; do not hold the response.
  if (result.advanced) {
    const work = Promise.resolve();
    try { waitUntil(work); } catch { /* not on Vercel */ }
  }

  return NextResponse.json(result);
}
