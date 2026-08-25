-- Chill Agent — context system schema (Supabase Postgres)
-- Owner: Kun. Apply via Supabase SQL editor. Tables here are the context-system
-- workstream only; Tim's tables (users, shipments, extracted_invoices) live in
-- his branch — integration points are marked below.

-- One row per business the platform serves. config mirrors context/config/*.ts
-- at seed time; DB is the runtime source of truth (autonomy counters change).
create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,              -- e.g. 'demo-import'
  name text not null,
  config jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists agent_roles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  key text not null,                     -- e.g. 'sales_quote'
  name text not null,
  system_prompt text not null,
  action_types text[] not null,          -- actions this role may draft
  context_tags text[] not null default '{}', -- which context_notes it gets
  autonomy_level int not null default 0, -- 0 = draft-only, 1 = auto-execute
  promote_threshold int not null default 3,
  clean_approvals int not null default 0,
  unique (business_id, key)
);

-- The approval queue. context_snapshot stores exactly what the agent knew when
-- it drafted — every decision is reconstructable (the audit-trail spike).
create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  role_id uuid not null references agent_roles(id),
  action_type text not null,
  title text not null,                   -- one line shown in LINE + dashboard
  payload jsonb not null,                -- the drafted thing (quote, email, PO)
  context_snapshot jsonb not null default '{}',
  state text not null default 'pending_approval'
    check (state in ('drafted','pending_approval','approved','rejected','executed','auto_executed')),
  decided_by text,                       -- 'owner' | 'auto'
  decision_reason text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  executed_at timestamptz
);
create index if not exists approvals_pending_idx on approvals (business_id, state, created_at desc);

-- Append-only. Never UPDATE or DELETE rows here (enforced by convention +
-- no update policy; the demo shows this table as the audit trail).
create table if not exists decision_log (
  id bigint generated always as identity primary key,
  business_id uuid not null references businesses(id),
  actor text not null,                   -- 'agent:sales_quote' | 'owner' | 'system'
  action text not null,                  -- 'drafted' | 'approved' | 'rejected' | 'executed' | 'promoted' | 'demoted' | 'auto_executed'
  reason text,
  approval_id uuid references approvals(id),
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists decision_log_biz_idx on decision_log (business_id, created_at desc);

-- Files live in the 'docs' storage bucket; this table is their index + the
-- extraction results. Tim's extracted_invoices can either merge into
-- `extracted` here or stay separate — decide in the types.ts PR review.
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  storage_path text not null,            -- path inside the 'docs' bucket
  doc_type text not null
    check (doc_type in ('rfq','supplier_quote','commercial_invoice','packing_list','other')),
  extracted jsonb,                       -- parsed fields (Tim's JSON schema)
  uploaded_by text,
  created_at timestamptz not null default now()
);

-- Business facts agents must know (incoterm defaults, preferred suppliers,
-- pricing rules, tone). Tagged so each role pulls only what it needs.
create table if not exists context_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  tags text[] not null default '{}',
  content text not null,
  source text,                           -- where the fact came from
  created_at timestamptz not null default now()
);

-- Lock everything down: no anon/browser access. All reads and writes go
-- through server code using the service key (server-side only, never shipped
-- to the client). Frontend gets data via our own API routes.
alter table businesses enable row level security;
alter table agent_roles enable row level security;
alter table approvals enable row level security;
alter table decision_log enable row level security;
alter table documents enable row level security;
alter table context_notes enable row level security;
