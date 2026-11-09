-- Proactive field-level frost scan cadence, private to the trusted cron worker.
-- User-facing alerts remain in app_notifications with existing preference checks.
create table if not exists public.pusula_frost_scan_state (
  field_id uuid primary key references public.fields(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_checked_at timestamptz not null default now(),
  last_error text
);
create index if not exists pusula_frost_scan_checked_idx
  on public.pusula_frost_scan_state (last_checked_at);
create index if not exists pusula_frost_scan_user_idx
  on public.pusula_frost_scan_state (user_id);
alter table public.pusula_frost_scan_state enable row level security;
-- No anon/authenticated grants or policies. Reads/writes are service-only.
revoke all on public.pusula_frost_scan_state from public, anon, authenticated;
grant select, insert, update, delete on public.pusula_frost_scan_state to service_role;
comment on table public.pusula_frost_scan_state is
  'Server-only last-checked receipts to fairly rotate field frost scans.';
