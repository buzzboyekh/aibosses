-- Demand pooling: several kitchens wanting the same ingredient for the same
-- delivery date, combined into one order that reaches a volume none of them
-- reaches alone.
--
-- Why this exists: a wholesaler's 30-40% is, in large part, payment for
-- aggregating demand. A single restaurant ordering 15kg of grouper cannot
-- reach the 50kg tier the pond prices at, so "buy at origin price" is a
-- promise we cannot keep for a small kitchen — unless we do the aggregating.
-- This is that mechanism, and it is the difference between the platform and
-- the middleman it replaces.
--
-- Additive only: no existing table or column is touched. Safe to re-run.

create table if not exists demand_pools (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  item text not null,                    -- matches a `size` in config.price_list
  delivery_date date not null,           -- the shared window; kitchens only pool on the same day
  target_qty numeric not null,           -- the tier we are trying to reach
  moq numeric not null,                  -- the supplier's own minimum; below this there is no order
  state text not null default 'open'
    check (state in ('open','filled','ordered','expired','cancelled')),
  closes_at timestamptz not null,        -- deadline to join
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One open pool per item per delivery date, or kitchens get split across
-- competing pools and neither reaches the tier — which defeats the point.
create unique index if not exists demand_pools_open_idx
  on demand_pools (business_id, item, delivery_date)
  where state = 'open';

create index if not exists demand_pools_state_idx
  on demand_pools (business_id, state, closes_at);

create table if not exists pool_commitments (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references demand_pools(id) on delete cascade,
  buyer_ref text not null,               -- which kitchen; a LINE user id or client name
  quantity numeric not null check (quantity > 0),
  -- Provisional until the pool closes. The price quoted to a kitchen is
  -- conditional for the same reason: we never promise a tier the pool has not
  -- actually reached, so nothing here needs enforcing against a kitchen that
  -- changes its mind.
  state text not null default 'pending'
    check (state in ('pending','committed','withdrawn')),
  approval_id uuid references approvals(id),
  created_at timestamptz not null default now(),
  unique (pool_id, buyer_ref)
);

create index if not exists pool_commitments_pool_idx
  on pool_commitments (pool_id, state);

alter table demand_pools enable row level security;
alter table pool_commitments enable row level security;
