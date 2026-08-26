// What happens when the owner taps a button, or a customer sends a message.
//
// Contract with the webhook route: these run AFTER we have already returned
// 200 to LINE. Never let one of these throw into the response path — LINE
// retries non-200 webhooks, which would double-process events.

import { SupabaseClient } from "@supabase/supabase-js";
import { decide, markExecuted } from "../context/decide";
import { deliver } from "../agents/deliver";
import { pushMessage } from "./client";
import { approvalCard, text } from "./templates";
import { decodePostback } from "./verify";

/** Owner tapped Approve or Reject. */
export async function handlePostback(
  db: SupabaseClient,
  ownerUserId: string,
  data: string
): Promise<void> {
  const parsed = decodePostback(data);
  if (!parsed) {
    console.error("[line] unparseable postback", data);
    return;
  }
  const { action, approvalId } = parsed;

  const result = await decide(
    db,
    approvalId,
    action === "approve" ? "approved" : "rejected",
    action === "approve" ? "approved from LINE" : "rejected from LINE",
    "owner"
  );

  // Double-tap: decide() is guarded, so the second tap transitions nothing.
  // Tell the owner what actually happened rather than silently doing nothing.
  if (!result.transitioned) {
    await pushMessage(ownerUserId, [text("Already handled — nothing sent twice.")]);
    return;
  }

  if (action === "reject") {
    await pushMessage(ownerUserId, [text("Rejected. The agent is back to draft-only.")]);
    return;
  }

  // Approved: mark it executed, then actually send it. Report the real
  // outcome, never "sent" when nothing left the building.
  await markExecuted(db, approvalId);
  const sent = await deliver(db, approvalId);
  await pushMessage(ownerUserId, [
    text(
      sent.delivered
        ? `Approved and sent. (${sent.detail})`
        : `Approved. Nothing was sent: ${sent.detail}`
    ),
  ]);
}

/** Push a drafted approval to the owner's phone. */
export async function notifyOwner(
  ownerUserId: string,
  args: {
    approvalId: string;
    roleName: string;
    title: string;
    body: string;
    reason: string;
  }
): Promise<{ ok: boolean; status: number }> {
  return pushMessage(ownerUserId, [approvalCard(args)]);
}

/**
 * A Level-1 role acts without asking. The owner is still told, after the fact,
 * or an auto-executed action would be invisible until someone opened the
 * dashboard.
 */
export async function notifyOwnerAutoExecuted(
  ownerUserId: string,
  args: { roleName: string; title: string; body: string }
): Promise<{ ok: boolean; status: number }> {
  return pushMessage(ownerUserId, [
    text(
      "Sent automatically by " + args.roleName + " (Level 1):\n\n" +
      args.title + "\n\n" + args.body.slice(0, 300)
    ),
  ]);
}

/**
 * Any inbound text. During setup this is how we learn the owner's userId:
 * LINE never tells you it up front, you read it off the first message.
 */
export async function handleText(
  db: SupabaseClient,
  userId: string,
  message: string,
  ownerUserId: string | null
): Promise<void> {
  if (!ownerUserId) {
    console.log("[line] SET LINE_OWNER_USER_ID =", userId);
    await pushMessage(userId, [
      text(`Setup: your LINE user id is\n${userId}\n\nPut it in LINE_OWNER_USER_ID.`),
    ]);
    return;
  }
  if (userId === ownerUserId) {
    if (message.trim().toLowerCase() === "ping") {
      await pushMessage(userId, [text("pong — webhook is live")]);
    }
    return; // the owner approves, he does not generate work for himself
  }

  // Anyone who is not the owner is a customer. Their message is an inquiry:
  // the quoting agent drafts a reply, and it goes to the owner for approval.
  // The customer gets an acknowledgement, never the draft itself.
  await pushMessage(userId, [text("Thanks, we are preparing a quote for you.")]);
  try {
    const { runAgentForInquiry } = await import("./inquiry");
    await runAgentForInquiry(db, userId, message, ownerUserId);
  } catch (err) {
    console.error("[line] inquiry agent failed", err);
    await pushMessage(ownerUserId, [
      text(`An inquiry came in but the agent failed:\n${String(err).slice(0, 200)}`),
    ]);
  }
}
