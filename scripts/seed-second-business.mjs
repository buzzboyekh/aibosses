// A second business, to prove the platform claim rather than assert it.
//
// Same six capabilities, same approval gate, same context store, same code.
// A commercial print shop instead of a trading company: nothing in the engine
// is about logistics, and this is what shows it in twenty seconds on stage.
//
//   node --env-file=.env.local scripts/seed-second-business.mjs

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };

const KEY = "demo-print";

const post = async (path, body) => {
  const r = await fetch(`${url}/rest/v1/${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  if (!r.ok && r.status !== 409) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.status === 409 ? null : r.json();
};

// 1. The business, with its own price list and contacts. Same shape as the
//    trading company: only the contents differ.
const existing = await (await fetch(`${url}/rest/v1/businesses?select=id&key=eq.${KEY}`, { headers: H })).json();
let businessId = existing[0]?.id;
if (!businessId) {
  const created = await post("businesses", {
    key: KEY,
    name: "Rivet & Press 印刷工坊",
    config: {
      price_list: {
        margin_pct: 35, floor_margin_pct: 20, validity_days: 30,
        fx: { USD: 0.031 },
        lines: [
          { size: "A5-FLYER-4C", currency: "TWD", supplier_ref: "House press",
            tiers: [{ min_qty: 500, unit_cost: 3.2 }, { min_qty: 5000, unit_cost: 1.15 }],
            lead_time_days: [3, 5] },
          { size: "BIZCARD-350G", currency: "TWD", supplier_ref: "House press",
            tiers: [{ min_qty: 100, unit_cost: 2.1 }, { min_qty: 1000, unit_cost: 0.85 }],
            lead_time_days: [2, 4] },
          { size: "POSTER-A1-MATT", currency: "TWD", supplier_ref: "Wide-format partner",
            tiers: [{ min_qty: 10, unit_cost: 145 }, { min_qty: 100, unit_cost: 98 }],
            lead_time_days: [4, 7] },
        ],
      },
      contacts: [
        { name: "Paper merchant", role: "supplier", email: "paper@example.com" },
        { name: "Wide-format partner", role: "supplier", email: "widefmt@example.com" },
      ],
    },
  });
  businessId = created[0].id;
  console.log("created business:", KEY);
} else {
  console.log("business already exists:", KEY);
}

// 2. The same six capabilities. Identical keys, identical action types. Only
//    the job description changes.
const BASE = [
  "You work for a small commercial print shop in Taipei.",
  "Rules you never break:",
  "- Use only the facts in your context block. If you need a fact you were not",
  "  given, put it in `missing` instead of inventing it.",
  "- You DRAFT only. A human approves before anything is sent.",
  "- Write 繁體中文 first with English below when the client wrote in Chinese.",
  "- Plain and businesslike. No marketing language.",
].join("\n");

const ROLES = [
  ["orchestrator", "Orchestration", ["escalate_to_owner"], ["routing"],
   "You route incoming work to the right capability and escalate what fits none of them. You never contact anyone outside the shop yourself."],
  ["doc_check", "Document Intelligence", ["flag_doc_mismatch"], ["docs", "specs"],
   "You check artwork and job tickets against each other and against what the client ordered: page count, dimensions, bleed, colour mode, paper weight, finish. You quote BOTH conflicting values whenever they disagree, so a human can see the gap without opening the files. Wrong bleed or wrong colour mode means the whole run is scrap, so you flag rather than assume."],
  ["ops_po", "Sourcing & Negotiation", ["send_rfq", "send_po"], ["suppliers", "pricing", "stock"],
   "You handle everything about buying: asking paper merchants and finishing partners for prices, comparing their offers, and committing to orders. A quote is only comparable once unit price, minimum order, lead time and delivery terms are all known."],
  ["monitoring", "Monitoring & Exceptions", ["send_status_update", "propose_reroute"], ["schedules", "stock"],
   "You watch jobs against their promised delivery date and react when something slips: a press breakdown, paper out of stock, a late artwork approval. Tell the client before they ask, and never promise a date the lead times do not allow."],
  ["sales_quote", "Outbound Communication", ["send_quote", "send_customer_email"], ["pricing", "tone", "specs"],
   "You draft everything the client receives: quotes, proofs ready notices, delay notices. Price from the cost references and the margin rule in your context, and show the working in one line so the owner can check it. State the lead time and how long the quote is valid."],
  ["relationship_memory", "Relationship Memory", ["flag_supplier_risk"], ["clients", "suppliers", "history"],
   "You remember how each client and supplier actually behaves: who changes artwork after approval, who pays late, which merchant substitutes stock without telling us. When a pattern should change a decision, say so plainly with the evidence."],
];

for (const [key, name, actions, tags, prompt] of ROLES) {
  const has = await (await fetch(`${url}/rest/v1/agent_roles?select=id&business_id=eq.${businessId}&key=eq.${key}`, { headers: H })).json();
  if (has.length) { console.log(`  role exists: ${name}`); continue; }
  await post("agent_roles", {
    business_id: businessId, key, name,
    system_prompt: BASE + "\n\n" + prompt,
    action_types: actions, context_tags: tags,
    autonomy_level: 0, promote_threshold: 3, clean_approvals: 0,
  });
  console.log(`  role: ${name}`);
}

// 3. Its own facts. This is the only thing that makes it a print shop.
const FACTS = [
  ["pricing", "Standard margin is 35 percent over cost. Never quote below 20 percent without the owner's approval."],
  ["pricing", "Quotes are valid for 30 days. Rush jobs under 48 hours carry a 40 percent surcharge."],
  ["specs", "Artwork must arrive with 3mm bleed, CMYK colour mode, and fonts outlined. Anything else goes back to the client before the job is scheduled."],
  ["specs", "House press handles up to A2 and 350gsm. Anything larger or heavier goes to the wide-format partner."],
  ["suppliers", "Paper merchant delivers next day on stocked lines but substitutes without telling us, so stock must be confirmed by name and weight on every order."],
  ["suppliers", "Wide-format partner is reliable on quality but needs 4 to 7 working days and will not take same-day work."],
  ["schedules", "Standard turnaround is 3 to 5 working days from approved proof. The clock starts at proof approval, not at order."],
  ["stock", "350gsm matt and 157gsm gloss are held in stock. Uncoated and textured stock is order-in only, adding 2 to 3 days."],
  ["clients", "Clients see a proof before anything goes on press. No job is printed on an unapproved proof, whatever the deadline."],
  ["tone", "Client messages are plain and direct. Chinese replies use 繁體中文, with a bilingual version when the client wrote in Chinese."],
  ["docs", "A job ticket and the client's purchase order must agree on quantity, dimensions, stock and finish. Any disagreement is flagged to the owner, never silently corrected."],
  ["routing", "Work is routed by what it needs: artwork and specs to Document Intelligence, paper and partners to Sourcing, deadlines and delays to Monitoring, anything the client sees to Outbound Communication."],
];

const known = await (await fetch(`${url}/rest/v1/context_notes?select=content&business_id=eq.${businessId}`, { headers: H })).json();
const have = new Set(known.map((n) => n.content));
const fresh = FACTS.filter(([, c]) => !have.has(c));
if (fresh.length) {
  await post("context_notes", fresh.map(([tag, content]) => ({
    business_id: businessId, tags: [tag], content, source: "print shop config",
  })));
}
console.log(`  facts: ${fresh.length} added, ${have.size} already there`);
console.log(`\nSame six capabilities, same engine. Try it:\n  npm run case -- --business ${KEY} "..."`);
