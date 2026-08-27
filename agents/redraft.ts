// Rejecting should be the start of a conversation, not the end of one.
//
// Until now Approve and Reject were the only things the operator could say,
// so a draft that was 90% right had to be thrown away whole. A real operator
// says "no, use Supplier A, their lead time is confirmed" and expects the next
// version to reflect that. This is that loop.
//
// The correction is stored with the redraft, so the log shows not just that a
// human intervened but what they knew that the agent did not.

import { SupabaseClient } from "@supabase/supabase-js";
import { buildContext } from "../context/buildContext";
import { draftApproval } from "../context/decide";
import { callLlm } from "./llm";
import type { ActionType, Approval } from "../context/types";

/** The most recent rejection still waiting for the operator to say why. */
export async function pendingCorrection(
  db: SupabaseClient,
  businessId: string
): Promise<Approval | null> {
  const { data } = await db
    .from("approvals")
    .select("*")
    .eq("business_id", businessId)
    .eq("state", "rejected")
    .order("decided_at", { ascending: false })
    .limit(5);

  const rows = (data ?? []) as Approval[];
  return rows.find((a) => (a.payload as { awaiting_correction?: boolean })?.awaiting_correction) ?? null;
}

/** Mark a rejected draft as waiting for the operator to explain. */
export async function askForCorrection(
  db: SupabaseClient,
  approvalId: string
): Promise<void> {
  const { data: approval } = await db
    .from("approvals").select("payload").eq("id", approvalId).single();
  if (!approval) return;
  await db.from("approvals").update({
    payload: { ...(approval.payload ?? {}), awaiting_correction: true },
  }).eq("id", approvalId);
}

/**
 * Take the operator's correction and produce a new draft of the same action,
 * by the same role, for the same case step.
 */
export async function redraft(
  db: SupabaseClient,
  approval: Approval,
  correction: string
): Promise<{ approvalId: string; title: string; body: string; roleName: string } | null> {
  const { data: role } = await db
    .from("agent_roles").select("*").eq("id", approval.role_id).single();
  const { data: business } = await db
    .from("businesses").select("key").eq("id", approval.business_id).single();
  if (!role || !business) return null;

  const previous = (approval.payload as { body?: string })?.body ?? "";

  const task = [
    "You drafted this and the operator rejected it. Draft it again, taking",
    "the correction into account. The correction comes from a human who knows",
    "something you did not, so follow it even if your context suggests",
    "otherwise. If the correction conflicts with a rule you must not break,",
    "say so in `missing` rather than breaking the rule.",
    "",
    "What you sent:",
    previous.slice(0, 1500),
    "",
    "What the operator said:",
    correction.slice(0, 800),
  ].join("\n");

  const ctx = await buildContext(db, business.key, role.key, task);
  const draft = await callLlm(ctx.systemPrompt, ctx.contextBlock);

  const { approval: fresh } = await draftApproval(db, {
    businessId: approval.business_id,
    roleId: approval.role_id,
    roleKey: role.key,
    actionType: approval.action_type as ActionType,
    title: draft.title,
    payload: {
      body: draft.body,
      missing: draft.missing ?? [],
      deliver_to: (approval.payload as { deliver_to?: unknown })?.deliver_to ?? { channel: "none" },
      case_id: (approval.payload as { case_id?: string })?.case_id,
      redraft_of: approval.id,
      correction,
    },
    snapshot: { ...ctx.snapshot, correction },
    reason: `redrafted after "${correction.slice(0, 90)}"`,
  });

  // The old one is answered now.
  await db.from("approvals").update({
    payload: { ...(approval.payload ?? {}), awaiting_correction: false, redrafted_as: fresh.id },
  }).eq("id", approval.id);

  // If it belonged to a case step, the new draft takes over the wait.
  const caseStepId = (approval as { case_step_id?: string }).case_step_id;
  if (caseStepId) {
    await db.from("approvals").update({ case_step_id: caseStepId }).eq("id", fresh.id);
    await db.from("case_steps").update({
      status: "awaiting_approval", approval_id: fresh.id,
    }).eq("id", caseStepId);
    const cid = (approval.payload as { case_id?: string })?.case_id;
    if (cid) await db.from("cases").update({ state: "waiting" }).eq("id", cid);
  }

  await db.from("decision_log").insert({
    business_id: approval.business_id,
    actor: `agent:${role.key}`,
    action: "redrafted",
    reason: `operator said: ${correction.slice(0, 200)}`,
    approval_id: fresh.id,
  });

  return { approvalId: fresh.id, title: draft.title, body: draft.body, roleName: role.name };
}
