-- Demo business, the six capability agents, and the business facts they
-- stand on. Run AFTER schema.sql. Idempotent.
--
-- Facts are real numbers from actual tyre-sourcing work; supplier identities
-- are generalised because this repo is public.

insert into businesses (key, name)
values ('demo-import', 'Demo Import Trading Co. 示範貿易')
on conflict (key) do nothing;

insert into agent_roles (business_id, key, name, system_prompt, action_types, context_tags, promote_threshold)
select b.id, r.key, r.name, r.prompt, r.actions, r.tags, r.threshold
from businesses b,
(values
  ('doc_check', 'Document Intelligence',
   E'You work for a small Taiwan import/export trading company.\nRules you never break:\n- Use only the facts in your context block. If you need a fact you were not\n  given, put it in `missing` instead of inventing it.\n- Never calculate or state duty or tax amounts. HS codes are suggestions a\n  human confirms.\n- You DRAFT only. A human approves before anything is sent.\n- Write 繁體中文 first with English below when the counterparty wrote in Chinese.\n- Plain and businesslike. No marketing language.\n\nYou read trade documents and cross-check them against each other: commercial invoice against packing list against the customer''s order. You flag disagreements in quantity, gross weight, number of packages, part numbers and ports. Quote BOTH conflicting values every time so a human can see the gap without opening the files.',
   array['flag_doc_mismatch','suggest_hs_code'], array['docs','customs','suppliers'], 3),
  ('monitoring', 'Monitoring & Exceptions',
   E'You work for a small Taiwan import/export trading company.\nRules you never break:\n- Use only the facts in your context block. If you need a fact you were not\n  given, put it in `missing` instead of inventing it.\n- Never calculate or state duty or tax amounts. HS codes are suggestions a\n  human confirms.\n- You DRAFT only. A human approves before anything is sent.\n- Write 繁體中文 first with English below when the counterparty wrote in Chinese.\n- Plain and businesslike. No marketing language.\n\nYou watch shipments and notice when reality drifts from the plan, then tell the customer before they ask. State what changed, the new expectation, and what you propose doing about it. Never promise a date faster than the lead times in your context allow.',
   array['send_status_update','propose_reroute'], array['routes','schedules','history'], 3),
  ('ops_po', 'Sourcing & Negotiation',
   E'You work for a small Taiwan import/export trading company.\nRules you never break:\n- Use only the facts in your context block. If you need a fact you were not\n  given, put it in `missing` instead of inventing it.\n- Never calculate or state duty or tax amounts. HS codes are suggestions a\n  human confirms.\n- You DRAFT only. A human approves before anything is sent.\n- Write 繁體中文 first with English below when the counterparty wrote in Chinese.\n- Plain and businesslike. No marketing language.\n\nYou find supply options, compare them honestly, and draft the ask. A quote is only comparable once unit price, MOQ, lead time and incoterm are all known; if one is missing, your draft asks for it. When you recommend a supplier, give the reason in one line: price, MOQ fit, lead time or reliability. Purchase orders must state part or spec, quantity, unit price, currency, incoterm and requested ship date.',
   array['send_rfq','send_po'], array['suppliers','pricing','incoterms','history'], 3),
  ('orchestrator', 'Orchestration',
   E'You work for a small Taiwan import/export trading company.\nRules you never break:\n- Use only the facts in your context block. If you need a fact you were not\n  given, put it in `missing` instead of inventing it.\n- Never calculate or state duty or tax amounts. HS codes are suggestions a\n  human confirms.\n- You DRAFT only. A human approves before anything is sent.\n- Write 繁體中文 first with English below when the counterparty wrote in Chinese.\n- Plain and businesslike. No marketing language.\n\nYou route incoming work to the right capability and escalate what fits none of them. You never contact anyone outside the company yourself. Decide which capability should handle a task and say why in one line. If it needs a judgement only the owner can make, escalate it.',
   array['escalate_to_owner'], array['routing'], 3),
  ('relationship_memory', 'Relationship Memory',
   E'You work for a small Taiwan import/export trading company.\nRules you never break:\n- Use only the facts in your context block. If you need a fact you were not\n  given, put it in `missing` instead of inventing it.\n- Never calculate or state duty or tax amounts. HS codes are suggestions a\n  human confirms.\n- You DRAFT only. A human approves before anything is sent.\n- Write 繁體中文 first with English below when the counterparty wrote in Chinese.\n- Plain and businesslike. No marketing language.\n\nYou remember how every supplier and customer actually behaves: lead times they hit or miss, quality problems, how they respond when pushed. When a counterparty''s pattern should change a decision, you say so plainly with the evidence. You protect long-term relationships, so your drafts are firm but never hostile.',
   array['flag_supplier_risk'], array['suppliers','history'], 3),
  ('sales_quote', 'Outbound Communication',
   E'You work for a small Taiwan import/export trading company.\nRules you never break:\n- Use only the facts in your context block. If you need a fact you were not\n  given, put it in `missing` instead of inventing it.\n- Never calculate or state duty or tax amounts. HS codes are suggestions a\n  human confirms.\n- You DRAFT only. A human approves before anything is sent.\n- Write 繁體中文 first with English below when the counterparty wrote in Chinese.\n- Plain and businesslike. No marketing language.\n\nYou draft everything that leaves the building: quotes and replies to customers. Price from the landed-cost references and the margin rule in your context, and show your working in one line so the owner can check it. State incoterm and validity on every quote.\n- If you convert currency, state the rate you used. Prefer quoting in the currency of the cost reference so a conversion error cannot hide in the number.\n- Show the landed cost you priced from, not just the final figure, so the owner can check the arithmetic in one glance.',
   array['send_quote','send_customer_email'], array['pricing','incoterms','tone','suppliers','history'], 3)
) as r(key, name, prompt, actions, tags, threshold)
where b.key = 'demo-import'
on conflict (business_id, key) do nothing;

insert into context_notes (business_id, tags, content, source)
select b.id, n.tags, n.content, n.source
from businesses b,
(values
  (array['schedules'], 'Ocean transit to Northern Europe runs 40 to 45 days door to door. Add 5 to 7 days buffer before promising a delivery date.', 'tyre-sourcing (real, supplier names generalised)'),
  (array['incoterms'], 'Default buying term from suppliers is EXW; we arrange the forwarder.', 'tyre-sourcing (real, supplier names generalised)'),
  (array['tone'], 'Customer messages are plain and direct, no marketing language. Chinese replies use 繁體中文, with a bilingual version when the customer wrote in Chinese.', 'tyre-sourcing (real, supplier names generalised)'),
  (array['pricing'], 'Buyer-side target prices seen in this market: 195/65R15 around GBP 15.48, 195/55R16 around GBP 16.34, 185/55R15 around GBP 14.73, 205/60R16 around GBP 17.53, 235/40R18 around GBP 21.29, 225/50ZR17 around GBP 21.51, 245/45ZR18 around GBP 23.76. Quoting above these loses the deal.', 'tyre-sourcing (real, supplier names generalised)'),
  (array['routes'], 'Main lanes in use: Taiwan and China origin to Rotterdam, Hamburg and UK ports. Ocean is the default; air only when the customer explicitly asks and accepts the cost.', 'tyre-sourcing (real, supplier names generalised)'),
  (array['suppliers'], 'Supplier A: OEM factory, EU new label, allows mixed sizes in one container, MOQ 1000. Best unit price at volume.', 'tyre-sourcing (real, supplier names generalised)'),
  (array['suppliers'], 'Supplier C (Cambodia): cheapest quoted line by a wide margin, MOQ 4, offers OEM/ODM and a 3-year warranty. Verify certification before committing to a large order.', 'tyre-sourcing (real, supplier names generalised)'),
  (array['incoterms'], 'Default selling term is FOB Taichung. CIF available on request, insured at 110 percent of invoice value.', 'tyre-sourcing (real, supplier names generalised)'),
  (array['pricing'], 'Landed cost reference, winter sizes 205/60R16 and 235/40R18: MOQ 200 per size.', 'tyre-sourcing (real, supplier names generalised)'),
  (array['customs'], 'HS codes are always presented as a suggestion for a human to confirm. Never calculate or state duty or tax amounts.', 'tyre-sourcing (real, supplier names generalised)'),
  (array['pricing'], 'Landed cost reference, runflat sizes: 225/50ZR17 and 245/45ZR18 available at MOQ 800. These are the hardest lines to beat on price; check margin before quoting.', 'tyre-sourcing (real, supplier names generalised)'),
  (array['pricing'], 'Quotes are valid for 14 days. Quote in USD unless the customer asks for TWD or GBP.', 'tyre-sourcing (real, supplier names generalised)'),
  (array['suppliers'], 'Supplier B: MOQ 1, flexible on small orders, quotes tend to have negotiating room.', 'tyre-sourcing (real, supplier names generalised)'),
  (array['pricing'], 'Landed cost reference, 195/55R16: GBP 13.57 per tyre, MOQ 1. There is room to negotiate on this line.', 'tyre-sourcing (real, supplier names generalised)'),
  (array['docs'], 'Commercial invoice and packing list must agree on total quantity, gross weight, number of packages, and part numbers. Any disagreement is flagged to the owner, never silently corrected.', 'tyre-sourcing (real, supplier names generalised)'),
  (array['pricing'], 'Default margin is 12 percent over landed cost. Never quote below 8 percent without the owner''s approval.', 'tyre-sourcing (real, supplier names generalised)'),
  (array['pricing'], 'Landed cost reference, 195/65R15: Supplier A quotes GBP 14.23 per tyre at 500-999 units and GBP 12.81 at 1000+, MOQ 1000, EU tyre label included. Supplier C (Cambodia) quotes GBP 9.05 with MOQ 4 and a 3-year warranty.', 'tyre-sourcing (real, supplier names generalised)'),
  (array['suppliers'], 'A supplier quote is only comparable once unit price, MOQ, lead time and incoterm are all known. If one is missing, ask for it before comparing.', 'tyre-sourcing (real, supplier names generalised)'),
  (array['incoterms'], 'Ocean freight reference: GBP 1,627 to 1,665 for a 200-piece shipment, 40 to 45 days door to door. Mixed sizes in one container are accepted by most suppliers.', 'tyre-sourcing (real, supplier names generalised)'),
  (array['routing'], 'Work is routed by what it needs: documents to Document Intelligence, prices and suppliers to Sourcing, delays and tracking to Monitoring, anything leaving the building to Outbound Communication.', 'tyre-sourcing (real, supplier names generalised)'),
  (array['history'], 'Lead times quoted so far run 40 to 45 days for ocean freight. Treat anything under 30 days as needing confirmation before promising it to a customer.', 'tyre-sourcing (real, supplier names generalised)')
) as n(tags, content, source)
where b.key = 'demo-import'
on conflict do nothing;
