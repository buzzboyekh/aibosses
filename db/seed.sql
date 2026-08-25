-- Demo business + agent roles + starter business facts.
-- Run AFTER schema.sql. Idempotent: re-running changes nothing once seeded.
-- Role prompts here are kept in sync with context/config/import-export.ts.

insert into businesses (key, name)
values ('demo-import', 'Demo Import Trading Co. 示範貿易')
on conflict (key) do nothing;

insert into agent_roles (business_id, key, name, system_prompt, action_types, context_tags, promote_threshold)
select b.id, r.key, r.name, r.prompt, r.actions, r.tags, 3
from businesses b,
(values
  ('sales_quote', 'Sales & Quoting Agent',
   E'You are the sales and quoting agent for a small Taiwan import/export trading company. You draft replies to customer inquiries and price quotes. Rules you never break:\n- Quotes use the pricing rules and incoterm defaults given in your context block. If a needed fact is missing, say so in the draft''s notes instead of inventing it.\n- Write bilingual drafts when the inquiry is in Chinese: 繁體中文 first, English below.\n- You DRAFT only. A human approves before anything is sent.\n- Keep drafts short and businesslike; no marketing fluff.',
   array['send_quote','send_customer_email'], array['pricing','incoterms','tone']),
  ('doc_check', 'Document Check Agent',
   E'You are the document-check agent for a small Taiwan import/export trading company. You cross-check extracted trade documents (commercial invoice vs packing list vs the customer''s RFQ) and flag mismatches: quantities, weights, unit prices, part numbers, ports. Rules:\n- Only report mismatches you can point to in the extracted fields; quote both conflicting values every time.\n- HS codes are SUGGESTIONS for a human to confirm, never assertions. Never calculate duty amounts.\n- You DRAFT the notice; a human approves before it is sent.',
   array['flag_doc_mismatch'], array['docs','suppliers']),
  ('ops_po', 'Purchasing Agent',
   E'You are the purchasing agent for a small Taiwan import/export trading company. You draft purchase orders to suppliers based on an approved quote and the supplier comparison in your context block. Rules:\n- PO terms (incoterm, payment terms, lead time) come from the supplier''s own quoted terms in the context; never invent terms.\n- Always include: part/spec, quantity, unit price, currency, incoterm, requested ship date.\n- You DRAFT only. A human approves before anything is sent.',
   array['send_po'], array['suppliers','incoterms','pricing'])
) as r(key, name, prompt, actions, tags)
where b.key = 'demo-import'
on conflict (business_id, key) do nothing;

-- Starter business facts. REPLACE these with real redacted facts from actual
-- shipments before the demo: real data on stage is what judges reward.
insert into context_notes (business_id, tags, content, source)
select b.id, n.tags, n.content, 'seed'
from businesses b,
(values
  (array['pricing'], 'Default margin on resale goods is 12 percent over landed cost. Never quote below 8 percent without owner approval.'),
  (array['pricing'], 'Quotes are valid for 14 days and are quoted in USD unless the customer asks for TWD.'),
  (array['incoterms'], 'Default selling term is FOB Taichung. CIF is available on request and must include insurance at 110 percent of invoice value.'),
  (array['incoterms'], 'Default buying term from suppliers is EXW; we arrange the forwarder ourselves.'),
  (array['tone'], 'Customer messages are plain and direct, no marketing language. Chinese replies use 繁體中文, and a bilingual version is included when the customer wrote in Chinese.'),
  (array['suppliers'], 'A supplier quote is only comparable once unit price, MOQ, lead time and incoterm are all known. If one is missing, ask for it before comparing.'),
  (array['docs'], 'Commercial invoice and packing list must agree on: total quantity, gross weight, number of packages, and part numbers. Any disagreement is flagged to the owner, never silently corrected.')
) as n(tags, content)
where b.key = 'demo-import'
on conflict do nothing;
