// What happens when the owner taps a button, or a customer sends a message.
//
// Contract with the webhook route: these run AFTER we have already returned
// 200 to LINE. Never let one of these throw into the response path — LINE
// retries non-200 webhooks, which would double-process events.

import { SupabaseClient } from "@supabase/supabase-js";
import { decide, markExecuted } from "../context/decide";
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

  // Approved: this is where the real send would happen (email/LINE to the
  // customer). The demo stops at marking it executed and logging it.
  await markExecuted(db, approvalId);
  await pushMessage(ownerUserId, [text("Approved and sent.")]);
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
): Promise<void> {
  await pushMessage(ownerUserId, [approvalCard(args)]);
}

/**
 * Any inbound text. During setup this is how we learn the owner's userId:
 * LINE never tells you it up front, you read it off the first message.
 */
export async function handleText(
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
  if (userId === ownerUserId && message.trim().toLowerCase() === "ping") {
    await pushMessage(userId, [text("pong — webhook is live")]);
  }
}
