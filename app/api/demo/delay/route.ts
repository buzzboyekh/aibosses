// Triggers the Monitoring capability: a shipment slips and the agent drafts
// the customer notice before anyone asks. Used to drive the third act of the
// demo from a laptop key, so nothing depends on a real carrier feed.
//
// Guarded by the same key as the dashboard: this creates real approvals and
// pushes to a real phone, so it must not be open to the internet.

import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { serverDb } from "../../../../context/buildContext";
import { runAgent } from "../../../../agents/run";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const key = process.env.DASHBOARD_KEY;
  if (!key || req.headers.get("x-demo-key") !== key) {
    return new NextResponse("not found", { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const reference = String(body.reference ?? "TW-4471");
  const destination = String(body.destination ?? "Rotterdam");
  const cause = String(body.cause ?? "port congestion at Kaohsiung");
  const days = Number(body.days ?? 8);
  const cargo = String(body.cargo ?? "1000 x 195/65R15");

  const work = (async () => {
    try {
      await runAgent(serverDb(), {
        businessKey: process.env.BUSINESS_KEY ?? "demo-import",
        roleKey: "monitoring",
        actionType: "send_status_update",
        task: [
          "A shipment we are handling has slipped. Draft the message to the",
          "customer now, before they ask.",
          "",
          `Shipment: ${reference}`,
          `Cargo: ${cargo}`,
          `Destination: ${destination}`,
          `Delay: ${days} days later than planned`,
          `Cause: ${cause}`,
          "",
          "Say what changed, what the new expectation is, and what you propose",
          "doing about it. Do not promise a date faster than the lead times in",
          "your context allow.",
        ].join("\n"),
        notifyUserId: process.env.LINE_OWNER_USER_ID ?? null,
      });
    } catch (err) {
      console.error("[demo/delay] failed", err);
    }
  })();

  try { waitUntil(work); } catch { await work; }
  return NextResponse.json({ ok: true, reference, days, cause });
}
