-- Free photo AI analysis is rewarded-ad supported.
-- Premium remains ad-free.
-- A verified ai_extra_analysis ad claim grants one ai_reward_credit.
-- The Edge Function consumes the credit and refunds it on provider failure.

create or replace function public.check_ai_access()
returns table(
  allowed boolean,
  usage_id bigint,
  access_source text,
  plan text,
  daily_free_used boolean,
  free_remaining integer,
  reward_credits integer,
  unlimited boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_plan text;
  v_credits integer := 0;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(p.subscription_plan, 'free')
  into v_plan
  from public.profiles p
  where p.id = v_user;

  v_plan := coalesce(v_plan, 'free');

  if v_plan <> 'free' then
    return query
    select true, null::bigint, 'paid'::text, v_plan, false, 0, 0, true;
    return;
  end if;

  select coalesce(c.balance, 0)
  into v_credits
  from public.ai_reward_credits c
  where c.user_id = v_user;

  v_credits := coalesce(v_credits, 0);

  return query
  select
    (v_credits > 0),
    null::bigint,
    case when v_credits > 0 then 'rewarded_ad'::text else null::text end,
    v_plan,
    true,
    0,
    v_credits,
    false;
end;
$$;

create or replace function public.get_ai_access_status()
returns table(
  plan text,
  daily_free_used boolean,
  free_remaining integer,
  reward_credits integer,
  unlimited boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_plan text;
  v_credits integer := 0;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(p.subscription_plan, 'free')
  into v_plan
  from public.profiles p
  where p.id = v_user;

  v_plan := coalesce(v_plan, 'free');

  select coalesce(c.balance, 0)
  into v_credits
  from public.ai_reward_credits c
  where c.user_id = v_user;

  return query
  select
    v_plan,
    true,
    0,
    coalesce(v_credits, 0),
    (v_plan <> 'free');
end;
$$;

create or replace function public.consume_ai_access()
returns table(
  allowed boolean,
  usage_id bigint,
  access_source text,
  plan text,
  daily_free_used boolean,
  free_remaining integer,
  reward_credits integer,
  unlimited boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_plan text;
  v_date date := (now() at time zone 'Europe/Istanbul')::date;
  v_credits integer := 0;
  v_usage_id bigint;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(p.subscription_plan, 'free')
  into v_plan
  from public.profiles p
  where p.id = v_user;

  v_plan := coalesce(v_plan, 'free');

  if v_plan <> 'free' then
    insert into public.ai_usage(user_id, usage_date, access_source)
    values (v_user, v_date, 'paid')
    returning id into v_usage_id;

    return query
    select true, v_usage_id, 'paid'::text, v_plan, false, 0, 0, true;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user::text || ':ai-reward-credit'));

  insert into public.ai_reward_credits(user_id, balance)
  values (v_user, 0)
  on conflict (user_id) do nothing;

  select c.balance
  into v_credits
  from public.ai_reward_credits c
  where c.user_id = v_user
  for update;

  if coalesce(v_credits, 0) <= 0 then
    return query
    select false, null::bigint, null::text, v_plan, true, 0, 0, false;
    return;
  end if;

  update public.ai_reward_credits
  set
    balance = balance - 1,
    updated_at = now()
  where user_id = v_user;

  insert into public.ai_usage(user_id, usage_date, access_source)
  values (v_user, v_date, 'rewarded_ad')
  returning id into v_usage_id;

  return query
  select true, v_usage_id, 'rewarded_ad'::text, v_plan, true, 0, v_credits - 1, false;
end;
$$;

grant execute on function public.check_ai_access() to authenticated;
grant execute on function public.get_ai_access_status() to authenticated;
grant execute on function public.consume_ai_access() to authenticated;
