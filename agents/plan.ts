// Turning a goal into a plan is the Orchestration capability's real job.
//
// "Source 1000 tyres at the best price" is not one action. It is: ask three
// suppliers, wait, compare what comes back, weigh who actually delivers on
// time, recommend one, draft the order. Six steps, four capabilities, two
// waits. The planner writes that down so the runner can work through it.
//
// The plan is validated against the roster before it is stored: a step can
// only name a capability that exists and an action that capability is allowed
// to draft. A model cannot invent a step that bypasses permissions.

import { SupabaseClient } from "@supabase/supabase-js";
import type { ActionType } from "../context/types";

/**
 * What each capability is FOR, not just what it may send. Without this the
 * planner picked by vocabulary: it put "compare supplier quotes" on Document
 * Intelligence because both involve documents, when comparing prices is a
 * buying decision.
 */
const PURPOSE: Record<string, string> = {
  orchestrator:
    "routing work and escalating what fits nowhere. Never do the work itself",
  doc_check:
    "reading documents and cross-checking them AGAINST EACH OTHER for contradictions " +
    "(invoice vs packing list vs order). NOT for choosing between commercial offers",
  ops_po:
    "everything about buying: asking suppliers for prices, COMPARING their offers, " +
    "choosing one, and committing to an order. All supplier-facing work",
  monitoring:
    "watching a shipment against its plan and reacting when it slips",
  sales_quote:
    "everything the CUSTOMER receives: quotes, replies, notices. Customer-facing only, " +
    "never supplier-facing",
  relationship_memory:
    "judging how a counterparty has behaved over time, from history rather than this one deal",
};

export interface PlannedStep {
  role_key: string;
  action_type: ActionType | null;
  intent: string;
}

const SYSTEM = (roster: string) => [
  "You plan a piece of work for a small trading company by breaking it into",
  "ordered steps, each handled by one capability.",
  "",
  "Capabilities available:",
  roster,
  "",
  'Reply with JSON only: {"title": string, "steps": [{"role_key": string, "action_type": string|null, "intent": string}]}',
  "",
  "Rules:",
  "- Between 2 and 6 steps. Fewer is better. Do not invent work.",
  "- `action_type` is null for INTERNAL steps: comparing, weighing, deciding,",
  "  filing. Internal steps need no human approval and should be used freely.",
  "- `action_type` is set only when something LEAVES the company, and it must",
  "  be one this capability is listed as allowed to draft. Those get approved",
  "  by a human, so use them sparingly, at the real decision points.",
  "- Order matters: gather before comparing, compare before recommending,",
  "  recommend before committing.",
  "- `intent` is one line saying what this step is for. It must match the",
  "  action_type: do not write \"request quotes\" on a step whose action is",
  "  send_po. If the step asks for prices it is send_rfq; if it commits to an",
  "  order it is send_po.",
  "- Pick the capability by what the step IS FOR, not by vocabulary overlap.",
  "  Comparing supplier prices is a buying decision (ops_po), not a document",
  "  check. Writing to a customer is sales_quote even if it concerns a document.",
].join("\n");

export async function planCase(
  db: SupabaseClient,
  businessKey: string,
  goal: string
): Promise<{ title: string; steps: PlannedStep[] } | null> {
  const { data: business } = await db
    .from("businesses").select("id").eq("key", businessKey).single();
  if (!business) return null;

  const { data: roles } = await db
    .from("agent_roles").select("key,name,action_types").eq("business_id", business.id);
  if (!roles?.length) return null;

  const allowed = new Map<string, Set<string>>(
    roles.map((r: { key: string; action_types: string[] }) => [r.key, new Set(r.action_types)])
  );
  const roster = roles
    .map((r: { key: string; name: string; action_types: string[] }) =>
      `- ${r.key} (${r.name}) — ${PURPOSE[r.key] ?? "general work"}. May draft: ` +
      `${r.action_types.join(", ") || "nothing, internal work only"}`)
    .join("\n");

  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.LLM_MODEL ?? "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.1,
      messages: [
        { role: "system", content: SYSTEM(roster) },
        { role: "user", content: `Goal: ${goal.slice(0, 1500)}` },
      ],
    }),
  });
  if (!res.ok) return null;

  const j = await res.json();
  let parsed: { title?: unknown; steps?: unknown };
  try { parsed = JSON.parse(j.choices?.[0]?.message?.content ?? "{}"); } catch { return null; }
  if (!Array.isArray(parsed.steps)) return null;

  // Validate every step against the roster. A plan cannot grant a capability
  // an action it was never given.
  const steps: PlannedStep[] = [];
  for (const raw of parsed.steps.slice(0, 6)) {
    const s = raw as Partial<PlannedStep>;
    if (typeof s.role_key !== "string" || !allowed.has(s.role_key)) continue;
    if (typeof s.intent !== "string" || !s.intent.trim()) continue;
    let action: ActionType | null = null;
    const rawAction = s.action_type as unknown;
    if (typeof rawAction === "string" && rawAction !== "null" && rawAction !== "") {
      if (!allowed.get(s.role_key)!.has(rawAction)) continue; // not permitted: drop the step
      action = rawAction as ActionType;
    }
    steps.push({ role_key: s.role_key, action_type: action, intent: s.intent.trim() });
  }
  if (steps.length < 2) return null;

  const title = typeof parsed.title === "string" && parsed.title.trim()
    ? parsed.title.trim()
    : goal.slice(0, 60);
  return { title, steps };
}
