// Approval is not delivery.
//
// Until now the loop ended at `executed`: a row changed state, the log said
// "executed", and nothing ever reached the customer. That is fine for a demo
// and dishonest in a product. This is the half that actually sends.
//
// Every draft records where it should go. On approval we deliver there, and
// the outcome goes in the log either way, so a failed send is visible rather
// than silently swallowed.

import { SupabaseClient } from "@supabase/supabase-js";
import { pushMessage } from "../line/client";
import { sendEmail, subjectFor } from "./email";

export interface Recipient {
  channel: "line" | "email" | "none";
  user_id?: string;   // LINE
  email?: string;     // email
  label?: string;     // what to call them in the log
  reference?: string; // shipment or order ref, for the subject line
}

export interface DeliveryResult {
  delivered: boolean;
  detail: string;
}

export async function deliver(
  db: SupabaseClient,
  approvalId: string
): Promise<DeliveryResult> {
  const { data: approval } = await db
    .from("approvals").select("*").eq("id", approvalId).single();
  if (!approval) return { delivered: false, detail: "approval not found" };

  const payload = (approval.payload ?? {}) as {
    body?: string;
    deliver_to?: Recipient;
  };
  const to = payload.deliver_to;
  const body = payload.body ?? approval.title;

  const hasTarget = to && (to.user_id || to.email);
  if (!to || to.channel === "none" || !hasTarget) {
    // Either genuinely internal work, or a counterparty we have no channel for
    // yet (suppliers have email, not LINE). Say which, so the operator knows
    // whether to do something about it.
    const isCaseStep = Boolean((payload as { case_id?: string }).case_id);
    const detail = isCaseStep
      ? "no send channel for this recipient yet — the draft is on the dashboard, ready to copy"
      : "internal action, nothing to send";
    await log(db, approval.business_id, approvalId, "delivery_skipped", detail);
    return { delivered: false, detail };
  }

  if (to.channel === "line" && to.user_id) {
    const res = await pushMessage(to.user_id, [{ type: "text", text: body }]);
    if (res.ok) {
      await log(db, approval.business_id, approvalId, "delivered",
        `sent to ${to.label ?? "customer"} over LINE`);
      return { delivered: true, detail: "sent over LINE" };
    }
    // Loud, not silent: the owner thinks this went out.
    await log(db, approval.business_id, approvalId, "delivery_failed",
      `LINE push failed with ${res.status}; the customer did NOT receive this`);
    return { delivered: false, detail: `LINE push failed (${res.status})` };
  }

  if (to.channel === "email" && to.email) {
    const res = await sendEmail({
      to: to.email,
      subject: subjectFor(approval.title, to.reference),
      body,
    });
    await log(db, approval.business_id, approvalId,
      res.sent ? "delivered" : "delivery_failed", res.detail);
    return { delivered: res.sent, detail: res.detail };
  }

  return { delivered: false, detail: `unknown channel ${to.channel}` };
}

async function log(
  db: SupabaseClient,
  businessId: string,
  approvalId: string,
  action: string,
  reason: string
) {
  await db.from("decision_log").insert({
    business_id: businessId, actor: "system", action, reason, approval_id: approvalId,
  });
}
