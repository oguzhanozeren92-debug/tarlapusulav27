-- Günlük sulama ihtiyacı taraması için tarla başına son kontrol kaydı.
-- Yalnız sunucu (service_role) okur/yazar; kullanıcıya bildirim app_notifications ile gider.
create table if not exists public.irrigation_need_scan_state (
  field_id uuid primary key references public.fields(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_checked_at timestamptz not null default now(),
  last_error text,
  last_result jsonb
);
create index if not exists irrigation_need_scan_checked_idx
  on public.irrigation_need_scan_state (last_checked_at);
create index if not exists irrigation_need_scan_user_idx
  on public.irrigation_need_scan_state (user_id);
alter table public.irrigation_need_scan_state enable row level security;
revoke all on public.irrigation_need_scan_state from public, anon, authenticated;
grant select, insert, update, delete on public.irrigation_need_scan_state to service_role;
comment on table public.irrigation_need_scan_state is
  'Server-only last-checked receipts for daily irrigation-need (rain deficit) scans.';
