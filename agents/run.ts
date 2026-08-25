// The full loop, in one function:
//   context -> model -> approval queue -> the owner's phone
//
// Nothing here sends anything to a customer. The agent only ever produces a
// draft that lands in the queue; sending happens after the owner approves.

import { SupabaseClient } from "@supabase/supabase-js";
import { buildContext } from "../context/buildContext";
import { draftApproval } from "../context/decide";
import { notifyOwner, notifyOwnerAutoExecuted } from "../line/handlers";
import type { ActionType } from "../context/types";
import { callLlm } from "./llm";

export async function runAgent(
  db: SupabaseClient,
  args: {
    businessKey: string;
    roleKey: string;
    actionType: ActionType;
    task: string;
    notifyUserId?: string | null;
  }
): Promise<{ approvalId: string; title: string; autoExecuted: boolean }> {
  const ctx = await buildContext(db, args.businessKey, args.roleKey, args.task);

  // A role may only draft the actions its config declares. Without this a
  // prompt could talk any agent into any action.
  if (!ctx.role.action_types.includes(args.actionType)) {
    throw new Error(
      `role ${args.roleKey} may not draft ${args.actionType} (allowed: ${ctx.role.action_types.join(", ")})`
    );
  }

  const draft = await callLlm(ctx.systemPrompt, ctx.contextBlock);

  // Missing facts are surfaced to the owner rather than quietly invented.
  const reason =
    draft.missing && draft.missing.length
      ? `${draft.reason} (missing: ${draft.missing.join("; ")})`
      : draft.reason;

  const { approval, autoExecuted } = await draftApproval(db, {
    businessId: ctx.business.id,
    roleId: ctx.role.id,
    roleKey: ctx.role.key,
    actionType: args.actionType,
    title: draft.title,
    payload: { body: draft.body, missing: draft.missing ?? [] },
    snapshot: ctx.snapshot,
    reason,
  });

  if (args.notifyUserId) {
    if (autoExecuted) {
      // A promoted role acts without asking, but the owner must still SEE it.
      // Previously this path sent nothing at all, so an auto-executed action
      // was invisible until someone happened to open the dashboard.
      await notifyOwnerAutoExecuted(args.notifyUserId, {
        roleName: ctx.role.name,
        title: draft.title,
        body: draft.body,
      });
    } else {
      await notifyOwner(args.notifyUserId, {
        approvalId: approval.id,
        roleName: ctx.role.name,
        title: draft.title,
        body: draft.body,
        reason,
      });
    }
  }

  return { approvalId: approval.id, title: draft.title, autoExecuted };
}
