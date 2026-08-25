// Approval lifecycle. Three entry points:
//   draftApproval() — an agent finished drafting; queue it (or auto-execute if
//                     the role has earned Level 1 for this action type)
//   decide()        — the owner tapped Approve/Reject (LINE postback or dashboard)
//   markExecuted()  — the approved action actually went out
//
// decide() is idempotent under double-taps: the guarded UPDATE only succeeds
// for the first caller (state must still be 'pending_approval'); later calls
// see 0 rows changed and return { transitioned: false }.

import { SupabaseClient } from "@supabase/supabase-js";
import type { ActionType, Approval, ContextSnapshot } from "./types";

async function log(
  db: SupabaseClient,
  businessId: string,
  actor: string,
  action: string,
  reason: string | null,
  approvalId: string | null,
  meta: Record<string, unknown> = {}
) {
  await db.from("decision_log").insert({
    business_id: businessId, actor, action, reason, approval_id: approvalId, meta,
  });
}

export async function draftApproval(
  db: SupabaseClient,
  args: {
    businessId: string;
    roleId: string;
    roleKey: string;
    actionType: ActionType;
    title: string;
    payload: Record<string, unknown>;
    snapshot: ContextSnapshot;
    reason: string; // the agent's one-line why
  }
): Promise<{ approval: Approval; autoExecuted: boolean }> {
  const { data: role } = await db
    .from("agent_roles").select("*").eq("id", args.roleId).single();

  const auto =
    role?.autonomy_level === 1 && role.action_types.includes(args.actionType);

  const { data: approval, error } = await db
    .from("approvals")
    .insert({
      business_id: args.businessId,
      role_id: args.roleId,
      action_type: args.actionType,
      title: args.title,
      payload: args.payload,
      context_snapshot: args.snapshot,
      state: auto ? "auto_executed" : "pending_approval",
      decided_by: auto ? "auto" : null,
      decided_at: auto ? new Date().toISOString() : null,
      executed_at: auto ? new Date().toISOString() : null,
    })
    .select().single();
  if (error || !approval) throw new Error(`draftApproval failed: ${error?.message}`);

  await log(
    db, args.businessId, `agent:${args.roleKey}`,
    auto ? "auto_executed" : "drafted",
    args.reason, approval.id,
    auto ? { autonomy_level: 1 } : {}
  );
  return { approval: approval as Approval, autoExecuted: auto };
}

export async function decide(
  db: SupabaseClient,
  approvalId: string,
  decision: "approved" | "rejected",
  reason: string | null,
  decidedBy: string = "owner"
): Promise<{ transitioned: boolean; approval?: Approval }> {
  // Guarded update: only transitions if still pending. This is the idempotency.
  const { data: rows, error } = await db
    .from("approvals")
    .update({
      state: decision,
      decided_by: decidedBy,
      decision_reason: reason,
      decided_at: new Date().toISOString(),
    })
    .eq("id", approvalId)
    .eq("state", "pending_approval")
    .select();
  if (error) throw new Error(`decide failed: ${error.message}`);
  if (!rows || rows.length === 0) return { transitioned: false }; // double-tap / already decided

  const approval = rows[0] as Approval;

  // Autonomy bookkeeping — only the winning call reaches this block.
  const { data: role } = await db
    .from("agent_roles").select("*").eq("id", approval.role_id).single();
  if (role) {
    if (decision === "approved") {
      const clean = role.clean_approvals + 1;
      const promote = role.autonomy_level === 0 && clean >= role.promote_threshold;
      await db.from("agent_roles")
        .update({ clean_approvals: clean, autonomy_level: promote ? 1 : role.autonomy_level })
        .eq("id", role.id);
      if (promote) {
        await log(db, approval.business_id, "system", "promoted", // the demo beat
          `${role.name} reached ${clean} clean approvals; now Level 1 (auto-execute)`,
          approval.id, { role_key: role.key });
      }
    } else {
      // Rejection resets trust; a Level-1 role is demoted back to draft-only.
      // Read the old level BEFORE the update: `role` may alias the stored row.
      const wasAutonomous = role.autonomy_level === 1;
      await db.from("agent_roles")
        .update({ clean_approvals: 0, autonomy_level: 0 })
        .eq("id", role.id);
      if (wasAutonomous) {
        await log(db, approval.business_id, "system", "demoted",
          `${role.name} rejected by owner; back to draft-only`, approval.id,
          { role_key: role.key });
      }
    }
  }

  await log(db, approval.business_id, decidedBy, decision, reason, approval.id);
  return { transitioned: true, approval };
}

export async function markExecuted(
  db: SupabaseClient,
  approvalId: string
): Promise<{ transitioned: boolean }> {
  const { data: rows, error } = await db
    .from("approvals")
    .update({ state: "executed", executed_at: new Date().toISOString() })
    .eq("id", approvalId)
    .eq("state", "approved")
    .select();
  if (error) throw new Error(`markExecuted failed: ${error.message}`);
  if (!rows || rows.length === 0) return { transitioned: false };
  const a = rows[0] as Approval;
  await log(db, a.business_id, "system", "executed", null, a.id);
  return { transitioned: true };
}
