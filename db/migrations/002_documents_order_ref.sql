-- Adds order pairing to `documents`, owned by the /documents feature (Eric).
-- Additive only — does not touch any existing column, table, or Kun's
-- schema.sql. Safe to re-run.
--
-- Why: buildContext() pulls the 10 most-recently-extracted documents into
-- every agent's context regardless of which order they belong to. Once more
-- than one invoice/packing-list pair is in flight, we need a way to say
-- "these two go together" so the doc-check step compares the right pair.
-- order_ref is free text the uploader fills in (e.g. a customer name or PO
-- number) — no attempt to auto-derive it from extracted fields, since those
-- can be missing or inconsistent between the two documents.

alter table documents add column if not exists order_ref text;

create index if not exists documents_order_ref_idx
  on documents (business_id, order_ref);
