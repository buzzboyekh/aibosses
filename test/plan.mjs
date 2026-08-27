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
/**
 * What each capability is FOR, not just what it may send. Without this the
 * planner picked by vocabulary: it put "compare supplier quotes" on Document
 * Intelligence because both involve documents, when comparing prices is a
 * buying decision.
 */
const PURPOSE = {
    orchestrator: "routing work and escalating what fits nowhere. Never do the work itself",
    doc_check: "reading documents and cross-checking them AGAINST EACH OTHER for contradictions " +
        "(invoice vs packing list vs order). NOT for choosing between commercial offers",
    ops_po: "everything about buying: asking suppliers for prices, COMPARING their offers, " +
        "choosing one, and committing to an order. All supplier-facing work",
    monitoring: "watching a shipment against its plan and reacting when it slips",
    sales_quote: "everything the CUSTOMER receives: quotes, replies, notices. Customer-facing only, " +
        "never supplier-facing",
    relationship_memory: "judging how a counterparty has behaved over time, from history rather than this one deal",
};
/**
 * The only instruction the memory agent gets beyond its own job description.
 * The last clause is the anti-invention guard: an agent that has learned
 * nothing about a supplier must say so rather than produce a plausible
 * character assessment out of thin air.
 */
export const MEMORY_INTENT = "Check what we have on record about each supplier who replied and say " +
    "whether any of it should change which one we pick. Name the supplier, " +
    "quote the record, and say plainly where we have no record at all.";
/**
 * Put the memory step into a sourcing plan, right after the request for
 * quotation. Deterministic rather than left to the planner: asked to keep
 * plans short, it never once chose this role, so the capability existed and
 * never ran.
 *
 * Internal (action_type null) on purpose. As an outbound action it would queue
 * an approval in the middle of the job and stall the run.
 */
export function withMemoryStep(steps) {
    if (steps.some((s) => s.role_key === "relationship_memory"))
        return steps;
    const afterRfq = steps.map((s) => s.action_type).lastIndexOf("send_rfq");
    if (afterRfq === -1)
        return steps; // not a sourcing job, leave it alone
    const out = [...steps];
    out.splice(afterRfq + 1, 0, {
        role_key: "relationship_memory",
        action_type: null,
        intent: MEMORY_INTENT,
    });
    return out.slice(0, 7);
}
const SYSTEM = (roster) => [
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
export async function planCase(db, businessKey, goal) {
    const { data: business } = await db
        .from("businesses").select("id").eq("key", businessKey).single();
    if (!business)
        return null;
    const { data: roles } = await db
        .from("agent_roles").select("key,name,action_types").eq("business_id", business.id);
    if (!roles?.length)
        return null;
    const allowed = new Map(roles.map((r) => [r.key, new Set(r.action_types)]));
    const roster = roles
        .map((r) => `- ${r.key} (${r.name}) — ${PURPOSE[r.key] ?? "general work"}. May draft: ` +
        `${r.action_types.join(", ") || "nothing, internal work only"}`)
        .join("\n");
    const key = process.env.OPENAI_API_KEY;
    if (!key)
        return null;
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
    if (!res.ok)
        return null;
    const j = await res.json();
    let parsed;
    try {
        parsed = JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
    }
    catch {
        return null;
    }
    if (!Array.isArray(parsed.steps))
        return null;
    // Validate every step against the roster. A plan cannot grant a capability
    // an action it was never given.
    const steps = [];
    for (const raw of parsed.steps.slice(0, 6)) {
        const s = raw;
        if (typeof s.role_key !== "string" || !allowed.has(s.role_key))
            continue;
        if (typeof s.intent !== "string" || !s.intent.trim())
            continue;
        let action = null;
        if (s.role_key === "relationship_memory") {
            // Memory reasons about counterparties; it never sends anything. An
            // outbound action here stalls the job waiting for an approval nobody
            // expects.
            steps.push({ role_key: s.role_key, action_type: null, intent: s.intent.trim() });
            continue;
        }
        const rawAction = s.action_type;
        if (typeof rawAction === "string" && rawAction !== "null" && rawAction !== "") {
            if (!allowed.get(s.role_key).has(rawAction))
                continue; // not permitted: drop the step
            action = rawAction;
        }
        steps.push({ role_key: s.role_key, action_type: action, intent: s.intent.trim() });
    }
    if (steps.length < 2)
        return null;
    const title = typeof parsed.title === "string" && parsed.title.trim()
        ? parsed.title.trim()
        : goal.slice(0, 60);
    // Only if this business actually has the role; otherwise runStep would throw
    // "role not found" and block the case.
    const withMemory = allowed.has("relationship_memory") ? withMemoryStep(steps) : steps;
    if (withMemory.length === steps.length && allowed.has("relationship_memory")) {
        console.log("[plan] no send_rfq step, so no memory step was added");
    }
    return { title, steps: withMemory };
}
