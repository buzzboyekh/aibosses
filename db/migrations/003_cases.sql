-- Cases: work that takes more than one step, more than one capability, and
-- more than one day.
--
-- Until now an inbound message produced one draft and the system forgot it.
-- A real job is "source 1000 tyres at the best price": ask three suppliers,
-- wait for replies that arrive hours apart, compare them, weigh who actually
-- delivers on time, recommend one, draft the PO, get it approved. That is six
-- steps across four capabilities with two waits in the middle.
--
-- A case holds the goal and survives. Steps are the plan. The runner advances
-- it whenever something happens: a reply lands, an approval is tapped, a timer
-- fires.

create table if not exists cases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  kind text not null,                    -- 'sourcing' | 'quote' | 'exception'
  title text not null,
  goal text not null,                    -- plain language, what done looks like
  state text not null default 'planning'
    check (state in ('planning','running','waiting','blocked','done','cancelled')),
  counterparty text,                     -- who this is for
  data jsonb not null default '{}',      -- what the case has gathered so far
  opened_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists cases_open_idx on cases (business_id, state, updated_at desc);

create table if not exists case_steps (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  seq int not null,                      -- order within the plan
  role_key text not null,                -- which capability does it
  action_type text,                      -- null for internal steps
  intent text not null,                  -- what this step is for, in one line
  status text not null default 'pending'
    check (status in ('pending','running','awaiting_approval','awaiting_reply','done','skipped','failed')),
  input jsonb not null default '{}',
  output jsonb,
  approval_id uuid references approvals(id),
  blocked_reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (case_id, seq)
);
create index if not exists case_steps_next_idx on case_steps (case_id, status, seq);

-- Link approvals back to the step that produced them, so tapping Approve can
-- advance the case that was waiting on it.
alter table approvals add column if not exists case_step_id uuid references case_steps(id);
create index if not exists approvals_step_idx on approvals (case_step_id);

alter table cases enable row level security;
alter table case_steps enable row level security;
