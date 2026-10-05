-- TarlaPusula smart phone notification policy
alter table public.profiles
  add column if not exists last_active_at timestamptz not null default now();

create index if not exists idx_profiles_last_active_at
  on public.profiles(last_active_at);

create table if not exists public.user_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  push_enabled boolean not null default true,
  critical_enabled boolean not null default true,
  weather_enabled boolean not null default true,
  satellite_enabled boolean not null default true,
  field_activity_enabled boolean not null default true,
  irrigation_enabled boolean not null default true,
  plant_health_enabled boolean not null default true,
  market_enabled boolean not null default true,
  support_enabled boolean not null default true,
  news_enabled boolean not null default true,
  reports_enabled boolean not null default true,
  achievement_enabled boolean not null default true,
  reengagement_enabled boolean not null default true,
  quiet_start time without time zone not null default '21:30',
  quiet_end time without time zone not null default '08:00',
  daily_normal_limit smallint not null default 3 check (daily_normal_limit between 0 and 10),
  timezone text not null default 'Europe/Istanbul',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_notification_preferences enable row level security;

drop policy if exists "notification preferences own select" on public.user_notification_preferences;
create policy "notification preferences own select"
  on public.user_notification_preferences for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "notification preferences own insert" on public.user_notification_preferences;
create policy "notification preferences own insert"
  on public.user_notification_preferences for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "notification preferences own update" on public.user_notification_preferences;
create policy "notification preferences own update"
  on public.user_notification_preferences for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.app_notifications
  add column if not exists category text not null default 'system',
  add column if not exists push_eligible boolean not null default false,
  add column if not exists push_critical boolean not null default false,
  add column if not exists push_available_at timestamptz not null default now(),
  add column if not exists push_claimed_at timestamptz,
  add column if not exists push_sent_at timestamptz,
  add column if not exists push_attempts integer not null default 0,
  add column if not exists push_error text;

create index if not exists idx_app_notifications_push_due
  on public.app_notifications(push_eligible, push_sent_at, push_available_at, created_at)
  where push_eligible = true and push_sent_at is null;

create or replace function public.claim_due_app_push_notifications(p_limit integer default 50)
returns table (
  id uuid,
  user_id uuid,
  kind text,
  source text,
  severity text,
  title text,
  message text,
  target text,
  data jsonb,
  category text,
  push_critical boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidate as (
    select n.id
    from public.app_notifications n
    where n.push_eligible = true
      and n.push_sent_at is null
      and n.push_available_at <= now()
      and (n.push_claimed_at is null or n.push_claimed_at < now() - interval '10 minutes')
    order by n.push_critical desc, n.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ), claimed as (
    update public.app_notifications n
    set push_claimed_at = now(),
        push_attempts = n.push_attempts + 1
    from candidate c
    where n.id = c.id
    returning n.*
  )
  select c.id,c.user_id,c.kind,c.source,c.severity,c.title,c.message,c.target,c.data,
         c.category,c.push_critical,c.created_at
  from claimed c;
end;
$$;

revoke all on function public.claim_due_app_push_notifications(integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_app_push_notifications(integer)
  to service_role;

create table if not exists public.field_activity_notification_state (
  field_id uuid primary key references public.fields(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_checked_at timestamptz,
  last_candidate_key text,
  last_notified_candidate_key text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_field_activity_notification_state_user
  on public.field_activity_notification_state(user_id,last_checked_at);

alter table public.field_activity_notification_state enable row level security;

drop policy if exists "field activity notification state own select"
  on public.field_activity_notification_state;
create policy "field activity notification state own select"
  on public.field_activity_notification_state
  for select to authenticated
  using (auth.uid() = user_id);
