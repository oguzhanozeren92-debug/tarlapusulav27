-- Zararlı takvimi aylık hatırlatması ve ilaçlama yoklaması.
-- Sunucu her tarla için ayda bir satır açar (o ay takvimde izlenecek zararlı varsa),
-- bir hafta sonra "İlaçlama yaptın mı?" diye sorar. Kullanıcı yalnızca kendi
-- satırının cevabını ve bir sonraki soru zamanını güncelleyebilir.
create table if not exists public.pest_spray_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  field_id uuid not null references public.fields(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  crop text,
  pests text[] not null default '{}',
  dry_days date[] not null default '{}',
  ask_at timestamptz not null,
  asked_at timestamptz,
  ask_count smallint not null default 0,
  response text check (response in ('yaptim', 'yapacagim', 'yapmayacagim')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (field_id, month)
);
create index if not exists pest_spray_checkins_user_idx on public.pest_spray_checkins (user_id, ask_at);
create index if not exists pest_spray_checkins_due_idx on public.pest_spray_checkins (ask_at)
  where response is null or response = 'yapacagim';

alter table public.pest_spray_checkins enable row level security;
revoke all on public.pest_spray_checkins from public, anon, authenticated;
grant select, insert, update, delete on public.pest_spray_checkins to service_role;
grant select on public.pest_spray_checkins to authenticated;
grant update (response, responded_at, ask_at) on public.pest_spray_checkins to authenticated;

drop policy if exists pest_spray_checkins_select_own on public.pest_spray_checkins;
create policy pest_spray_checkins_select_own on public.pest_spray_checkins
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists pest_spray_checkins_update_own on public.pest_spray_checkins;
create policy pest_spray_checkins_update_own on public.pest_spray_checkins
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

comment on table public.pest_spray_checkins is
  'Monthly pest-calendar reminder per field and the farmer''s spray check-in answer (yaptim / yapacagim / yapmayacagim).';
