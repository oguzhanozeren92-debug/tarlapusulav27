-- Verified AdMob rewarded SSV receipts.
-- Google-signed callbacks are the source of truth; clients only poll by nonce.

create table if not exists public.admob_reward_receipts (
  nonce text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  placement text not null,
  provider_transaction_id text not null unique,
  ad_unit text,
  reward_amount numeric,
  reward_item text,
  awarded boolean not null default false,
  awarded_points integer not null default 0,
  reason text not null default 'pending',
  points bigint not null default 0,
  lifetime_points bigint not null default 0,
  daily_count integer not null default 0,
  daily_limit integer not null default 5,
  ai_credit_granted boolean not null default false,
  verified_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admob_reward_receipts_user_created
  on public.admob_reward_receipts(user_id, created_at desc);

alter table public.admob_reward_receipts enable row level security;

revoke all on table public.admob_reward_receipts from anon, authenticated;
grant all on table public.admob_reward_receipts to service_role;

comment on table public.admob_reward_receipts is
  'Google AdMob rewarded SSV receipts. Service-role only; clients poll through rewarded-ad-claim.';
