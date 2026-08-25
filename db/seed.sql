-- Seed the demo business + roles (mirrors context/config/import-export.ts).
-- Run AFTER schema.sql. Idempotent: re-running does nothing once seeded.

insert into businesses (key, name)
values ('demo-import', 'Demo Import Trading Co. 示範貿易')
on conflict (key) do nothing;

insert into agent_roles (business_id, key, name, system_prompt, action_types, context_tags, promote_threshold)
select b.id, r.key, r.name, r.system_prompt, r.action_types, r.context_tags, 3
from businesses b,
(values
  ('sales_quote', 'Sales & Quoting Agent',
   'Seeded placeholder — real prompt synced from context/config/import-export.ts by the seed script in the repo.',
   array['send_quote','send_customer_email'], array['pricing','incoterms','tone']),
  ('doc_check', 'Document Check Agent',
   'Seeded placeholder — real prompt synced from context/config/import-export.ts by the seed script in the repo.',
   array['flag_doc_mismatch'], array['docs','suppliers']),
  ('ops_po', 'Purchasing Agent',
   'Seeded placeholder — real prompt synced from context/config/import-export.ts by the seed script in the repo.',
   array['send_po'], array['suppliers','incoterms','pricing'])
) as r(key, name, system_prompt, action_types, context_tags)
where b.key = 'demo-import'
on conflict (business_id, key) do nothing;

-- Starter business facts. Replace/extend with real redacted facts from Kun's
-- tyre-sourcing docs before the demo (that is the "real data on stage" beat).
insert into context_notes (business_id, tags, content, source)
select b.id, v.tags, v.content, v.source
from businesses b,
(values
  (array['pricing'],   'Standard quote margin: 12% over landed cost. Never quote below 8% without owner approval.', 'owner'),
  (array['incoterms'], 'Default sell terms: FOB Taichung. Default buy terms from CN suppliers: FOB Qingdao unless quoted otherwise.', 'owner'),
  (array['tone'],      'Customers are small Taiwan businesses; write like a person, not a corporation. 繁體中文 first when they write Chinese.', 'owner'),
  (array['suppliers'], 'Preferred suppliers require 30% deposit, balance before shipment. Flag any PO that deviates.', 'owner')
) as v(tags, content, source)
where b.key = 'demo-import'
  and not exists (select 1 from context_notes cn where cn.business_id = b.id);
