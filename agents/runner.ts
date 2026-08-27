// The runner works a case forward, one step at a time, and stops when it needs
// something it does not have: a human decision, or a reply that has not
// arrived. Every time the world changes (an approval is tapped, a supplier
// answers) the case is nudged and continues from where it stopped.
//
// This is what makes it a company rather than a chatbot: work outlives the
// message that started it.

import { SupabaseClient } from "@supabase/supabase-js";
import { buildContext } from "../context/buildContext";
import { draftApproval } from "../context/decide";
import { callLlm } from "./llm";
import { notifyOwner } from "../line/handlers";
import { planCase } from "./plan";
import type { ActionType, Case, CaseStep } from "../context/types";

/** Anything going to a supplier goes by email; anything to the customer, LINE. */
const TO_SUPPLIER: ActionType[] = ["send_rfq", "send_po"];

interface Contact { name: string; role: string; email?: string; line_user_id?: string }

async function recipientFor(
  db: SupabaseClient,
  kase: Case,
  actionType: ActionType
): Promise<{ channel: "line" | "email" | "none"; user_id?: string; email?: string; label?: string; reference?: string }> {
  const { data: business } = await db
    .from("businesses").select("config").eq("id", kase.business_id).single();
  const contacts = ((business?.config as { contacts?: Contact[] } | null)?.contacts ?? []);
  const reference = typeof kase.data?.reference === "string" ? kase.data.reference : undefined;

  if (TO_SUPPLIER.includes(actionType)) {
    const supplier = contacts.find((c) => c.role === "supplier" && c.email);
    return supplier
      ? { channel: "email", email: supplier.email, label: supplier.name, reference }
      : { channel: "none", label: "supplier (no contact on file)" };
  }

  // Customer-facing. The case records who it is for.
  const cp = kase.counterparty ?? "";
  if (cp.startsWith("U")) return { channel: "line", user_id: cp, label: "the customer", reference };
  const byName = contacts.find((c) => c.role === "customer" && c.name === cp && c.email);
  return byName
    ? { channel: "email", email: byName.email, label: byName.name, reference }
    : { channel: "none", label: cp || "the customer" };
}

export async function openCase(
  db: SupabaseClient,
  args: {
    businessKey: string;
    kind: string;
    goal: string;
    counterparty?: string | null;
    data?: Record<string, unknown>;
    openedBy?: string;
  }
): Promise<{ caseId: string; title: string; steps: number } | null> {
  const { data: business } = await db
    .from("businesses").select("id").eq("key", args.businessKey).single();
  if (!business) return null;

  const plan = await planCase(db, args.businessKey, args.goal);
  if (!plan) return null;

  const { data: kase } = await db.from("cases").insert({
    business_id: business.id,
    kind: args.kind,
    title: plan.title,
    goal: args.goal,
    state: "running",
    counterparty: args.counterparty ?? null,
    data: args.data ?? {},
    opened_by: args.openedBy ?? "system",
  }).select().single();
  if (!kase) return null;

  await db.from("case_steps").insert(
    plan.steps.map((s, i) => ({
      case_id: kase.id, seq: i + 1, role_key: s.role_key,
      action_type: s.action_type, intent: s.intent,
    }))
  );

  await log(db, business.id, "agent:orchestrator", "planned",
    `${plan.title}: ${plan.steps.map((s) => s.role_key).join(" → ")}`,
    { case_id: kase.id });

  return { caseId: kase.id, title: plan.title, steps: plan.steps.length };
}

/** Work the case forward until it needs something it cannot get by itself. */
export async function advanceCase(
  db: SupabaseClient,
  caseId: string,
  ownerUserId?: string | null,
  maxSteps = 6 // a case cannot spin: it stops, and a human restarts it
): Promise<{ state: string; ranSteps: number }> {
  let ran = 0;

  for (let i = 0; i < maxSteps; i++) {
    const { data: kase } = await db
      .from("cases").select("*").eq("id", caseId).single();
    if (!kase) return { state: "missing", ranSteps: ran };
    if (["done", "cancelled", "blocked"].includes(kase.state)) {
      return { state: kase.state, ranSteps: ran };
    }

    const { data: steps } = await db
      .from("case_steps").select("*").eq("case_id", caseId).order("seq");
    const all = (steps ?? []) as CaseStep[];

    // Anything still waiting blocks the case: that is the point of waiting.
    const waiting = all.find((s) =>
      s.status === "awaiting_approval" || s.status === "awaiting_reply");
    if (waiting) {
      await setCaseState(db, caseId, "waiting");
      return { state: "waiting", ranSteps: ran };
    }

    const next = all.find((s) => s.status === "pending");
    if (!next) {
      await closeCase(db, kase as Case);
      return { state: "done", ranSteps: ran };
    }

    await runStep(db, kase as Case, next, ownerUserId ?? null);
    ran++;
  }

  await setCaseState(db, caseId, "waiting");
  return { state: "waiting", ranSteps: ran };
}

async function runStep(
  db: SupabaseClient,
  kase: Case,
  step: CaseStep,
  ownerUserId: string | null
): Promise<void> {
  await db.from("case_steps")
    .update({ status: "running" }).eq("id", step.id).eq("status", "pending");

  const { data: business } = await db
    .from("businesses").select("key").eq("id", kase.business_id).single();
  const businessKey = business?.key ?? "demo-import";

  // Everything earlier steps discovered is visible to this one. That is the
  // shared brain doing its job: no step needs a briefing from the last.
  const gathered = Object.entries(kase.data ?? {})
    .map(([k, v]) => `- ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("\n");

  const task = [
    `You are working one step of an ongoing job.`,
    ``,
    `The job: ${kase.goal}`,
    `This step: ${step.intent}`,
    ``,
    gathered ? `What the job knows so far:\n${gathered}` : `Nothing gathered yet.`,
    ``,
    step.action_type
      ? `This step produces something that LEAVES the company, so a human approves it before it goes.`
      : `This is INTERNAL work. Nobody outside sees it. Produce the analysis or decision itself, concretely, so the next step can use it.`,
  ].join("\n");

  try {
    const ctx = await buildContext(db, businessKey, step.role_key, task);
    const draft = await callLlm(ctx.systemPrompt, ctx.contextBlock);

    if (!step.action_type) {
      // Internal: the finding is the output. Fold it into the case so later
      // steps can read it.
      await db.from("case_steps").update({
        status: "done",
        output: { title: draft.title, body: draft.body, missing: draft.missing ?? [] },
        completed_at: new Date().toISOString(),
      }).eq("id", step.id);

      await db.from("cases").update({
        data: { ...(kase.data ?? {}), [`step_${step.seq}_${step.role_key}`]: draft.body },
        updated_at: new Date().toISOString(),
      }).eq("id", kase.id);

      await log(db, kase.business_id, `agent:${step.role_key}`, "step_done",
        `${step.intent} — ${draft.title}`, { case_id: kase.id, seq: step.seq });
      return;
    }

    // Outbound: queue it and wait for a human.
    const { approval } = await draftApproval(db, {
      businessId: kase.business_id,
      roleId: ctx.role.id,
      roleKey: step.role_key,
      actionType: step.action_type,
      title: draft.title,
      payload: {
        body: draft.body,
        missing: draft.missing ?? [],
        deliver_to: await recipientFor(db, kase, step.action_type),
        case_id: kase.id,
      },
      snapshot: ctx.snapshot,
      reason: `${draft.reason} (step ${step.seq} of "${kase.title}")`,
    });

    await db.from("case_steps").update({
      status: "awaiting_approval", approval_id: approval.id,
    }).eq("id", step.id);
    await db.from("approvals").update({ case_step_id: step.id }).eq("id", approval.id);
    await setCaseState(db, kase.id, "waiting");

    if (ownerUserId) {
      await notifyOwner(ownerUserId, {
        approvalId: approval.id,
        roleName: ctx.role.name,
        title: draft.title,
        body: draft.body,
        reason: `step ${step.seq} of ${kase.title}`,
      });
    }
  } catch (err) {
    await db.from("case_steps").update({
      status: "failed", blocked_reason: String(err).slice(0, 300),
    }).eq("id", step.id);
    await db.from("cases").update({ state: "blocked", updated_at: new Date().toISOString() })
      .eq("id", kase.id);
    await log(db, kase.business_id, `agent:${step.role_key}`, "step_failed",
      String(err).slice(0, 200), { case_id: kase.id, seq: step.seq });
  }
}

/** Called when an approval attached to a case step is decided. */
export async function onApprovalDecided(
  db: SupabaseClient,
  approvalId: string,
  decision: "approved" | "rejected",
  ownerUserId?: string | null
): Promise<void> {
  const { data: step } = await db
    .from("case_steps").select("*").eq("approval_id", approvalId).maybeSingle();
  if (!step) return; // a one-off approval, not part of a case

  // Sending a request for quotation does not complete the step, it starts the
  // wait. The case parks until suppliers answer (see agents/reply.ts).
  const expectsReply = decision === "approved" && step.action_type === "send_rfq";

  await db.from("case_steps").update({
    status: decision === "approved" ? (expectsReply ? "awaiting_reply" : "done") : "skipped",
    completed_at: expectsReply ? null : new Date().toISOString(),
  }).eq("id", step.id);

  if (expectsReply) {
    await db.from("cases")
      .update({ state: "waiting", updated_at: new Date().toISOString() })
      .eq("id", step.case_id);
    return; // nothing more to do until someone replies
  }

  if (decision === "rejected") {
    // A rejection is a decision about the job, not just the message. Stop and
    // let the human say what should happen instead.
    await db.from("cases").update({ state: "blocked", updated_at: new Date().toISOString() })
      .eq("id", step.case_id);
    return;
  }

  await db.from("cases").update({ state: "running", updated_at: new Date().toISOString() })
    .eq("id", step.case_id);
  await advanceCase(db, step.case_id, ownerUserId);
}

/**
 * Put a blocked or failed case back to work. A step that failed is reset to
 * pending and tried again; without this a transient model error ends the job
 * permanently, which is not a thing a company does.
 */
export async function unblockCase(
  db: SupabaseClient,
  caseId: string,
  ownerUserId?: string | null
): Promise<{ state: string; ranSteps: number }> {
  await db.from("case_steps")
    .update({ status: "pending", blocked_reason: null })
    .eq("case_id", caseId).eq("status", "failed");
  await db.from("cases")
    .update({ state: "running", updated_at: new Date().toISOString() })
    .eq("id", caseId);
  return advanceCase(db, caseId, ownerUserId ?? null);
}

async function closeCase(db: SupabaseClient, kase: Case) {
  await db.from("cases").update({
    state: "done", closed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", kase.id);
  await log(db, kase.business_id, "agent:orchestrator", "case_closed", kase.title,
    { case_id: kase.id });
}

async function setCaseState(db: SupabaseClient, caseId: string, state: string) {
  await db.from("cases").update({ state, updated_at: new Date().toISOString() })
    .eq("id", caseId);
}

async function log(
  db: SupabaseClient, businessId: string, actor: string,
  action: string, reason: string, meta: Record<string, unknown> = {}
) {
  await db.from("decision_log").insert({ business_id: businessId, actor, action, reason, meta });
}
