update public.gamification_rules
set points = 10,
    daily_limit = 5,
    label = 'Reklam İzle',
    active = true
where rule_key = 'WATCH_AD';

create table if not exists public.ad_reward_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  provider_transaction_id text not null,
  placement text not null,
  points integer not null default 0 check (points >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(provider, provider_transaction_id)
);

alter table public.ad_reward_claims enable row level security;

drop policy if exists "Users can view own ad rewards" on public.ad_reward_claims;
create policy "Users can view own ad rewards"
on public.ad_reward_claims
for select
to authenticated
using (user_id = auth.uid());

create index if not exists ad_reward_claims_user_created_idx
  on public.ad_reward_claims(user_id, created_at desc);

do $$
begin
  if to_regprocedure('public.tp_award_points_internal_legacy(text,text,jsonb)') is null then
    alter function public.tp_award_points(text,text,jsonb)
      rename to tp_award_points_internal_legacy;
  end if;
end $$;

revoke all on function public.tp_award_points_internal_legacy(text,text,jsonb) from public;
revoke all on function public.tp_award_points_internal_legacy(text,text,jsonb) from anon;
revoke all on function public.tp_award_points_internal_legacy(text,text,jsonb) from authenticated;

create or replace function public.tp_award_points(
  p_rule_key text,
  p_dedupe_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table(
  awarded boolean,
  awarded_points integer,
  rule_key text,
  reason text,
  points bigint,
  lifetime_points bigint,
  unlocked_fields integer,
  next_field_number integer,
  next_threshold integer,
  remaining_to_next bigint,
  progress_percent integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state record;
begin
  if p_rule_key = 'WATCH_AD' then
    select * into v_state from public.tp_get_gamification_state();

    return query
    select
      false,
      0,
      p_rule_key,
      'verified_ad_required',
      v_state.points,
      v_state.lifetime_points,
      v_state.unlocked_fields,
      v_state.next_field_number,
      v_state.next_threshold,
      v_state.remaining_to_next,
      v_state.progress_percent;
    return;
  end if;

  return query
  select *
  from public.tp_award_points_internal_legacy(
    p_rule_key,
    p_dedupe_key,
    p_metadata
  );
end;
$$;

grant execute on function public.tp_award_points(text,text,jsonb) to authenticated;

create or replace function public.tp_award_verified_ad_reward(
  p_user_id uuid,
  p_provider text,
  p_provider_transaction_id text,
  p_placement text,
  p_metadata jsonb default '{}'::jsonb
)
returns table(
  awarded boolean,
  awarded_points integer,
  reason text,
  points bigint,
  lifetime_points bigint,
  daily_count integer,
  daily_limit integer,
  ai_credit_granted boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_rule public.gamification_rules%rowtype;
  v_today_count integer := 0;
  v_points bigint := 0;
  v_lifetime bigint := 0;
  v_ai_credit boolean := false;
begin
  if v_role <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  if p_user_id is null then
    raise exception 'user_required';
  end if;

  if nullif(trim(p_provider), '') is null
     or nullif(trim(p_provider_transaction_id), '') is null
     or nullif(trim(p_placement), '') is null then
    raise exception 'invalid_ad_claim';
  end if;

  select *
  into v_rule
  from public.gamification_rules
  where rule_key = 'WATCH_AD'
    and active = true;

  if not found then
    raise exception 'watch_ad_rule_inactive';
  end if;

  if exists (
    select 1
    from public.ad_reward_claims
    where provider = p_provider
      and provider_transaction_id = p_provider_transaction_id
  ) then
    select coalesce(points, 0), coalesce(lifetime_points, 0)
      into v_points, v_lifetime
    from public.user_gamification
    where user_id = p_user_id;

    return query
    select
      false,
      0,
      'duplicate',
      coalesce(v_points, 0),
      coalesce(v_lifetime, 0),
      (
        select count(*)::integer
        from public.ad_reward_claims
        where user_id = p_user_id
          and (created_at at time zone 'Europe/Istanbul')::date =
              (now() at time zone 'Europe/Istanbul')::date
      ),
      coalesce(v_rule.daily_limit, 5),
      false;
    return;
  end if;

  select count(*)::integer
  into v_today_count
  from public.ad_reward_claims
  where user_id = p_user_id
    and (created_at at time zone 'Europe/Istanbul')::date =
        (now() at time zone 'Europe/Istanbul')::date;

  if v_rule.daily_limit is not null and v_today_count >= v_rule.daily_limit then
    select coalesce(points, 0), coalesce(lifetime_points, 0)
      into v_points, v_lifetime
    from public.user_gamification
    where user_id = p_user_id;

    return query
    select
      false,
      0,
      'daily_limit',
      coalesce(v_points, 0),
      coalesce(v_lifetime, 0),
      v_today_count,
      v_rule.daily_limit,
      false;
    return;
  end if;

  insert into public.user_gamification(user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  insert into public.ad_reward_claims(
    user_id,
    provider,
    provider_transaction_id,
    placement,
    points,
    metadata
  )
  values (
    p_user_id,
    trim(p_provider),
    trim(p_provider_transaction_id),
    trim(p_placement),
    v_rule.points,
    coalesce(p_metadata, '{}'::jsonb)
  );

  insert into public.gamification_transactions(
    user_id,
    rule_key,
    points,
    dedupe_key,
    metadata
  )
  values (
    p_user_id,
    'WATCH_AD',
    v_rule.points,
    'ad:' || trim(p_provider) || ':' || trim(p_provider_transaction_id),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'provider', trim(p_provider),
      'placement', trim(p_placement)
    )
  );

  update public.user_gamification
  set
    points = user_gamification.points + v_rule.points,
    lifetime_points = user_gamification.lifetime_points + v_rule.points,
    updated_at = now()
  where user_id = p_user_id
  returning user_gamification.points, user_gamification.lifetime_points
  into v_points, v_lifetime;

  if p_placement = 'ai_extra_analysis' then
    insert into public.ai_reward_credits(user_id, balance, updated_at)
    values (p_user_id, 1, now())
    on conflict (user_id)
    do update set
      balance = public.ai_reward_credits.balance + 1,
      updated_at = now();

    v_ai_credit := true;
  end if;

  v_today_count := v_today_count + 1;

  return query
  select
    true,
    v_rule.points,
    'awarded',
    v_points,
    v_lifetime,
    v_today_count,
    coalesce(v_rule.daily_limit, 5),
    v_ai_credit;
end;
$$;

revoke all on function public.tp_award_verified_ad_reward(uuid,text,text,text,jsonb) from public;
revoke all on function public.tp_award_verified_ad_reward(uuid,text,text,text,jsonb) from anon;
revoke all on function public.tp_award_verified_ad_reward(uuid,text,text,text,jsonb) from authenticated;
grant execute on function public.tp_award_verified_ad_reward(uuid,text,text,text,jsonb) to service_role;
