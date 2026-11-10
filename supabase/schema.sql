create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  paypal_order_id text unique not null,
  paypal_capture_id text unique,
  description text,
  amount numeric(12,2) not null,
  currency text not null default 'USD',
  status text not null default 'created',
  paypal_status text,
  payer_email text,
  payer_id text,
  captured_at timestamptz,
  verified_at timestamptz,
  raw_capture jsonb,
  created_at timestamptz not null default now()
);

create table if not exists cases (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id),
  customer_email text not null,
  complaint_text text not null,
  requested_amount numeric(12,2),
  complaint_type text not null default 'unclassified',
  status text not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  kind text not null default 'photo',
  provided_by text not null default 'customer',
  storage_path text not null,
  mime_type text,
  original_name text,
  created_at timestamptz not null default now()
);

create table if not exists analyses (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  ai_source text not null,
  ai_model text,
  ai_json jsonb,
  ai_error text,
  evidence_json jsonb,
  score int,
  baseline_rec text,
  baseline_reason text,
  final_rec text,
  final_amount numeric(12,2),
  guardrail_notes jsonb,
  verification_json jsonb,
  created_at timestamptz not null default now()
);

create table if not exists refunds (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id),
  transaction_id uuid not null references transactions(id),
  amount numeric(12,2) not null,
  currency text not null,
  status text not null default 'pending',
  paypal_refund_id text,
  paypal_status text,
  response_json jsonb,
  http_status int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- At most one active (pending or completed) refund per case. A failed refund frees the case for a retry.
create unique index if not exists one_active_refund_per_case on refunds (case_id) where status in ('pending', 'completed');

create table if not exists audit_events (
  id bigint generated always as identity primary key,
  case_id uuid,
  transaction_id uuid,
  event_type text not null,
  actor text not null,
  summary text not null,
  data jsonb,
  created_at timestamptz not null default now()
);
create or replace function block_audit_changes() returns trigger language plpgsql as $$
begin
  raise exception 'audit_events is append-only';
end;
$$;
drop trigger if exists audit_no_change on audit_events;
create trigger audit_no_change before update or delete on audit_events for each row execute function block_audit_changes();

-- Only the server (service-role key) touches these tables. RLS with no policies blocks the public anon key.
alter table transactions enable row level security;
alter table cases enable row level security;
alter table evidence enable row level security;
alter table analyses enable row level security;
alter table refunds enable row level security;
alter table audit_events enable row level security;

insert into storage.buckets (id, name, public) values ('evidence', 'evidence', false) on conflict (id) do nothing;