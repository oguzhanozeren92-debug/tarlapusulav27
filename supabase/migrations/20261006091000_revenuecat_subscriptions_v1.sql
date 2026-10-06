-- TarlaPusula store subscription state.
-- RevenueCat remains receipt authority; profiles.subscription_plan is the app authorization cache.

alter table public.profiles
  add column if not exists subscription_source text,
  add column if not exists subscription_product_id text,
  add column if not exists subscription_expires_at timestamptz,
  add column if not exists subscription_updated_at timestamptz;

create table if not exists public.subscription_webhook_events (
  event_id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  store text,
  product_id text,
  environment text,
  event_timestamp_ms bigint,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_subscription_webhook_events_user_created
  on public.subscription_webhook_events(user_id, created_at desc);

alter table public.subscription_webhook_events enable row level security;

revoke all on table public.subscription_webhook_events from anon, authenticated;
grant all on table public.subscription_webhook_events to service_role;

comment on table public.subscription_webhook_events is
  'RevenueCat webhook idempotency/audit log. Service role only; never client writable.';

comment on column public.profiles.subscription_plan is
  'TarlaPusula authorization cache: free, plus, premium. RevenueCat/store purchases are synchronized server-side.';
