-- Solana Agentic Trading Research Platform schema
-- Apply with supabase db push / psql when DATABASE_URL is available.
-- Local default is in-memory demo persistence.

create extension if not exists "pgcrypto";

create table if not exists assets (
  mint text primary key,
  symbol text not null,
  name text not null,
  decimals int,
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists observations (
  id uuid primary key default gen_random_uuid(),
  mint text not null references assets(mint),
  observed_at timestamptz not null,
  price_usd numeric,
  market_cap_usd numeric,
  liquidity_usd numeric,
  volume_24h_usd numeric,
  payload jsonb not null default '{}'::jsonb
);
create index if not exists observations_mint_time_idx on observations(mint, observed_at desc);

create table if not exists signals (
  id uuid primary key default gen_random_uuid(),
  mint text not null,
  name text not null,
  value numeric not null,
  normalized_score numeric not null,
  confidence numeric not null,
  source text not null,
  created_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);
create index if not exists signals_mint_name_idx on signals(mint, name, created_at desc);

create table if not exists token_risk_assessments (
  id uuid primary key default gen_random_uuid(),
  mint text not null,
  risk_score numeric not null,
  risk_tier text not null,
  risk_flags text[] not null default '{}',
  risk_reasons text[] not null default '{}',
  data_confidence numeric not null,
  details jsonb not null,
  config_version text not null,
  assessed_at timestamptz not null
);
create index if not exists token_risk_mint_idx on token_risk_assessments(mint, assessed_at desc);

create table if not exists policy_assessments (
  id uuid primary key default gen_random_uuid(),
  mint text not null,
  decision text not null,
  reasons text[] not null,
  matched_rules text[] not null,
  config_version text not null,
  assessed_at timestamptz not null
);

create table if not exists research_briefs (
  id uuid primary key default gen_random_uuid(),
  mint text not null,
  thesis text not null,
  catalysts text[] not null,
  contradictions text[] not null,
  confidence numeric not null,
  is_mock boolean not null,
  generated_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists trade_proposals (
  id uuid primary key,
  mint text not null,
  symbol text not null,
  side text not null,
  size_usd numeric not null,
  status text not null,
  payload jsonb not null,
  created_at timestamptz not null
);
create index if not exists proposals_created_idx on trade_proposals(created_at desc);

create table if not exists paper_orders (
  id uuid primary key,
  mint text not null,
  side text not null,
  requested_usd numeric not null,
  filled_usd numeric not null,
  status text not null,
  costs jsonb not null,
  provenance jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
create index if not exists paper_orders_created_idx on paper_orders(created_at desc);

create table if not exists positions (
  id uuid primary key,
  mint text not null,
  symbol text not null,
  qty numeric not null,
  avg_entry_usd numeric not null,
  mark_usd numeric not null,
  unrealized_pnl_usd numeric not null,
  realized_pnl_usd numeric not null,
  opened_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  captured_at timestamptz not null,
  nav_usd numeric not null,
  cash_usd numeric not null,
  positions_value_usd numeric not null,
  drawdown_pct numeric not null,
  peak_nav_usd numeric not null
);
create index if not exists portfolio_snapshots_time_idx on portfolio_snapshots(captured_at desc);

create table if not exists experiments (
  id uuid primary key,
  name text not null,
  config jsonb not null,
  results jsonb not null,
  created_at timestamptz not null
);

create table if not exists benchmarks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  series jsonb not null,
  metrics jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists system_events (
  id uuid primary key,
  event_type text not null,
  mint text,
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  config_versions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null
);
create index if not exists system_events_type_time_idx on system_events(event_type, created_at desc);
