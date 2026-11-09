-- Pusula cross-device read receipts. Only event IDs are persisted here.
-- All underlying field data remains in its original module tables.
create table if not exists public.pusula_event_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  field_id uuid not null references public.fields(id) on delete cascade,
  event_id text not null check (length(event_id) between 1 and 320),
  seen_at timestamptz not null default now(),
  primary key (user_id, field_id, event_id)
);
create index if not exists pusula_event_receipts_recent_idx
  on public.pusula_event_receipts (user_id, field_id, seen_at desc);
alter table public.pusula_event_receipts enable row level security;
revoke all on table public.pusula_event_receipts from public, anon, authenticated;
grant select, insert on table public.pusula_event_receipts to authenticated;

create policy pusula_receipts_owner_read
  on public.pusula_event_receipts for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.fields f
      where f.id = field_id and f.user_id = (select auth.uid())
    )
  );

create policy pusula_receipts_owner_insert
  on public.pusula_event_receipts for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.fields f
      where f.id = field_id and f.user_id = (select auth.uid())
    )
  );
