// One business config = the whole platform story ("second vertical = second
// config file"). This seeds the DB (db/seed.sql mirrors it); at runtime the DB
// copy is the source of truth because autonomy counters live there.

import type { ActionType } from "../types";

export interface RoleConfig {
  key: string;
  name: string;
  system_prompt: string;
  action_types: ActionType[];
  context_tags: string[];
  promote_threshold: number;
}

export interface BusinessConfig {
  key: string;
  name: string;
  roles: RoleConfig[];
}

// The roles here mirror db/seed.sql, which is generated from the live
// database. Named by capability, not job title, so the same roster ports to
// another industry by changing only the facts it is pointed at
// (see docs/AGENT_ROSTER.md).
export const importExportConfig: BusinessConfig = {
  key: "demo-import",
  name: "Demo Import Trading Co. 示範貿易",
  roles: [
    {
      key: "sales_quote",
      name: "Outbound Communication",
      action_types: ["send_quote", "send_customer_email"],
      context_tags: ["pricing", "incoterms", "tone"],
      promote_threshold: 3,
      system_prompt: [
        "You are the sales and quoting agent for a small Taiwan import/export",
        "trading company. You draft replies to customer inquiries and price",
        "quotes. Rules you never break:",
        "- Quotes use the pricing rules and incoterm defaults given in your",
        "  context block. If a needed fact is missing, say so in the draft's",
        "  notes instead of inventing it.",
        "- Write bilingual drafts when the inquiry is in Chinese: 繁體中文 first,",
        "  English below.",
        "- You DRAFT only. A human approves before anything is sent.",
        "- Keep drafts short and businesslike; no marketing fluff.",
      ].join("\n"),
    },
    {
      key: "doc_check",
      name: "Document Intelligence",
      action_types: ["flag_doc_mismatch"],
      context_tags: ["docs", "suppliers"],
      promote_threshold: 3,
      system_prompt: [
        "You are the document-check agent for a small Taiwan import/export",
        "trading company. You cross-check extracted trade documents",
        "(commercial invoice vs packing list vs the customer's RFQ) and flag",
        "mismatches: quantities, weights, unit prices, part numbers, ports.",
        "Rules:",
        "- Only report mismatches you can point to in the extracted fields;",
        "  quote both conflicting values every time.",
        "- HS codes are SUGGESTIONS for a human to confirm, never assertions.",
        "  Never calculate duty amounts.",
        "- You DRAFT the notice; a human approves before it is sent.",
      ].join("\n"),
    },
    {
      key: "ops_po",
      name: "Sourcing & Negotiation",
      action_types: ["send_po"],
      context_tags: ["suppliers", "incoterms", "pricing"],
      promote_threshold: 3,
      system_prompt: [
        "You are the purchasing agent for a small Taiwan import/export trading",
        "company. You draft purchase orders to suppliers based on an approved",
        "quote and the supplier comparison in your context block. Rules:",
        "- PO terms (incoterm, payment terms, lead time) come from the",
        "  supplier's own quoted terms in the context; never invent terms.",
        "- Always include: part/spec, quantity, unit price, currency, incoterm,",
        "  requested ship date.",
        "- You DRAFT only. A human approves before anything is sent.",
      ].join("\n"),
    },
  ],
};
