// The food-sourcing business: restaurants and hotels buying ingredients
// straight from the source instead of through two or three middlemen.
//
// Same six capabilities, same approval gate, same context store, same code.
// Nothing in the engine is about tyres or freight, and this is the file that
// shows it. A vertical is a config, not a rebuild.
//
//   node --env-file=.env.local scripts/seed-food-sourcing.mjs
//
// Prices below are the shape of real Taiwanese wholesale sourcing (origin
// price, tiered by volume, short validity because food moves daily). They are
// illustrative, not scraped from a live market — say that if a judge asks.

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };

const KEY = "demo-food";

const post = async (path, body) => {
  const r = await fetch(`${url}/rest/v1/${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  if (!r.ok && r.status !== 409) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.status === 409 ? null : r.json();
};

// 1. The business. Costs are what the origin charges us; the margin rule turns
//    that into what the restaurant pays. Validity is 3 days, not 14 — fish and
//    vegetables reprice daily, and quoting a stale number is how you lose money.
const existing = await (await fetch(`${url}/rest/v1/businesses?select=id&key=eq.${KEY}`, { headers: H })).json();
let businessId = existing[0]?.id;
if (!businessId) {
  const created = await post("businesses", {
    key: KEY,
    name: "源頭直送 Yuan Fresh 食材直送",
    config: {
      price_list: {
        margin_pct: 18, floor_margin_pct: 10, validity_days: 3,
        fx: { USD: 0.031 },
        lines: [
          { size: "石斑魚", currency: "TWD", supplier_ref: "屏東枋寮契作魚塭",
            tiers: [{ min_qty: 10, unit_cost: 420 }, { min_qty: 50, unit_cost: 385 }],
            lead_time_days: [1, 2], note: "活魚現宰，需前一日下單" },
          { size: "白蝦", currency: "TWD", supplier_ref: "東港漁會",
            tiers: [{ min_qty: 10, unit_cost: 320 }, { min_qty: 100, unit_cost: 285 }],
            lead_time_days: [1, 2] },
          { size: "台灣鯛魚片", currency: "TWD", supplier_ref: "雲林口湖加工廠",
            tiers: [{ min_qty: 20, unit_cost: 180 }, { min_qty: 200, unit_cost: 152 }],
            lead_time_days: [2, 3], note: "急凍真空包，保存期 12 個月" },
          { size: "高麗菜", currency: "TWD", supplier_ref: "雲林西螺果菜市場",
            tiers: [{ min_qty: 20, unit_cost: 28 }, { min_qty: 200, unit_cost: 19 }],
            lead_time_days: [1, 1], note: "颱風後價格劇烈波動，報價前重新確認" },
          { size: "溫體豬後腿肉", currency: "TWD", supplier_ref: "彰化肉品市場",
            tiers: [{ min_qty: 10, unit_cost: 135 }, { min_qty: 100, unit_cost: 118 }],
            lead_time_days: [1, 1], note: "當日屠宰，僅供隔日配送" },
          { size: "池上米", currency: "TWD", supplier_ref: "台東池上農會",
            tiers: [{ min_qty: 30, unit_cost: 52 }, { min_qty: 300, unit_cost: 44 }],
            lead_time_days: [2, 4] },
        ],
      },
      contacts: [
        { name: "東港漁會", role: "supplier", email: "donggang@example.com" },
        { name: "雲林西螺果菜市場", role: "supplier", email: "xiluo@example.com" },
        { name: "彰化肉品市場", role: "supplier", email: "meat@example.com" },
      ],
    },
  });
  businessId = created[0].id;
  console.log("created business:", KEY);
} else {
  console.log("business already exists:", KEY);
}

// 2. The same six capabilities. Identical keys, identical action types — the
//    routing table and the approval ladder never learn what industry this is.
//    Only the job description changes.
const BASE = [
  "You work for a Taiwanese company that supplies restaurants and hotels with",
  "ingredients bought direct from the origin — fishing ports, contract farms,",
  "livestock markets — instead of through layers of wholesalers.",
  "Rules you never break:",
  "- Use only the facts in your context block. If you need a fact you were not",
  "  given, put it in `missing` instead of inventing it.",
  "- Never invent a price, a grade, or a certification. Food safety claims a",
  "  human has not confirmed are the fastest way to lose a client.",
  "- You DRAFT only. A human approves before anything is sent.",
  "- Write 繁體中文 first with English below when the counterparty wrote in Chinese.",
  "- Plain and businesslike. No marketing language.",
].join("\n");

const ROLES = [
  ["orchestrator", "Orchestration", ["escalate_to_owner"], ["routing"],
   "You route incoming work to the right capability and escalate what fits none of them. You never contact a client or a supplier yourself."],

  ["doc_check", "Document Intelligence", ["flag_doc_mismatch"], ["docs", "receiving"],
   "You cross-check what arrived against what was ordered and what is being billed: the delivery note against the purchase order against the supplier's invoice. Weight, count, item, grade, and the temperature recorded on arrival. Quote BOTH conflicting values every time so a human sees the gap without opening the files. A 5kg gap on fresh fish is a real loss, and nobody notices it a week later on the statement."],

  ["ops_po", "Sourcing & Negotiation", ["send_rfq", "send_po"], ["suppliers", "pricing", "seasons"],
   "You find where an ingredient actually comes from and what it costs at the source. You ask ports, farms and markets for prices, compare them honestly, and draft the order. A supplier's offer is only comparable once unit price, minimum order, lead time, grade and delivery terms are all known — if one is missing, your draft asks for it. When you recommend a source, give the reason in one line: price, availability, grade or reliability."],

  ["monitoring", "Monitoring & Exceptions", ["send_status_update", "propose_reroute"], ["seasons", "schedules", "history"],
   "You watch orders against their delivery window and react before the kitchen does: a closed fishing season, a typhoon that took out a growing region, a cold-chain truck running late. Tell the client before they ask, say what changed, and propose the substitute or the new date. Never promise a delivery the lead times do not allow."],

  ["sales_quote", "Outbound Communication", ["send_quote", "send_customer_email"], ["pricing", "tone", "seasons", "history"],
   "You draft everything a restaurant or hotel client receives: quotes, confirmations, shortage notices. Price from the origin cost and the margin rule in your context, and show the working in one line so the owner can check it. State the grade, the delivery date and how long the quote is valid — produce prices move daily and a stale quote is a loss."],

  ["relationship_memory", "Relationship Memory", ["flag_supplier_risk"], ["suppliers", "clients", "history"],
   "You remember how each source and each client actually behaves: which farm's grade slips in the wet season, who substitutes a cheaper species without saying so, which kitchen always orders late and then wants it tomorrow. When a pattern should change a decision, say so plainly with the evidence."],
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

// 3. Its own facts. This is the only thing that makes it a food business
//    rather than a tyre importer or a print shop.
const FACTS = [
  ["pricing", "Standard margin is 18 percent over origin cost. Never quote below 10 percent without the owner's approval — food margins are thin and there is no room to discover a mistake later."],
  ["pricing", "Quotes are valid for 3 days only. Fish and vegetable prices move daily; anything older is re-quoted, not honoured."],
  ["pricing", "Wholesalers in this market typically sell to restaurants at 30 to 40 percent over the origin price. That gap is the whole reason a kitchen buys from us, so quote the origin price plainly and let the number make the argument."],

  ["suppliers", "東港漁會 (Donggang Fishermen's Association) is the main source for white shrimp and day-boat catch. Reliable on grade, but the catch is whatever came in that morning — confirm availability before promising a species."],
  ["suppliers", "屏東枋寮契作魚塭 supplies grouper live, slaughtered to order. Needs the order the day before; there is no same-day grouper."],
  ["suppliers", "雲林西螺果菜市場 is the volume source for vegetables. Prices are set at auction each morning, so a vegetable quote given yesterday is already wrong."],
  ["suppliers", "彰化肉品市場 pork is slaughtered same-day and delivered next morning only. It cannot be held over a weekend."],
  ["suppliers", "A supplier offer is only comparable once unit price, minimum order, lead time, grade and delivery terms are all known. If one is missing, ask for it before comparing."],

  ["seasons", "Grouper and several reef species have a closed season; during it the contract ponds are the only legal supply and the price rises. Check the season before quoting a wild-caught species."],
  ["seasons", "After a typhoon, leaf vegetable prices from 雲林 and 彰化 can triple within 48 hours and stay high for two to three weeks. Re-price rather than honouring an old quote, and offer the substitute early."],
  ["seasons", "Chinese New Year demand lifts seafood prices sharply from roughly three weeks out. Kitchens that book early get the price; kitchens that call that week do not."],

  ["receiving", "Cold-chain deliveries must arrive at or below 8°C for chilled and −18°C for frozen, and the arrival temperature is recorded on the delivery note. A missing temperature is treated as a failed delivery, not a paperwork slip."],
  ["receiving", "Fresh seafood and produce are weighed on arrival. Ice and packaging are not billable weight — the delivery note must show net weight."],

  ["docs", "The delivery note, the purchase order and the supplier invoice must agree on item, grade, quantity and net weight. Any disagreement is flagged to the owner, never silently corrected."],
  ["docs", "Traceability documents (產銷履歷 or CAS) are presented as the supplier supplied them. Never assert a certification we have not been shown."],

  ["schedules", "Standard delivery is next morning for orders placed before 15:00. Anything after that ships the following day; there is no overnight exception for fresh goods."],

  ["clients", "Restaurant and hotel kitchens order for a service date, not a delivery date. Always confirm which one they mean when the two could differ."],
  ["tone", "Client messages are plain and direct, no marketing language. Chinese replies use 繁體中文, with a bilingual version when the client wrote in Chinese."],
  ["routing", "Work is routed by what it needs: delivery notes and invoices to Document Intelligence, sources and prices to Sourcing, shortages and delays to Monitoring, anything a client sees to Outbound Communication."],
  ["history", "Lead times run 1 to 2 days for port and market goods and 2 to 4 days for processed and dry goods. Treat anything faster than the published lead time as needing confirmation before promising it."],
];

const known = await (await fetch(`${url}/rest/v1/context_notes?select=content&business_id=eq.${businessId}`, { headers: H })).json();
const have = new Set(known.map((n) => n.content));
const fresh = FACTS.filter(([, c]) => !have.has(c));
if (fresh.length) {
  await post("context_notes", fresh.map(([tag, content]) => ({
    business_id: businessId, tags: [tag], content, source: "food sourcing config",
  })));
}
console.log(`  facts: ${fresh.length} added, ${have.size} already there`);
console.log(`\nSame six capabilities, same engine. Try it:\n  npm run case -- --business ${KEY} "..."`);
