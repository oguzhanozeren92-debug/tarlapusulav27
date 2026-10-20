-- TarlaPusula 2026-10-20: fully free, optional ads. Preserve user ownership,
-- enforce server-side resource rate limits, NEVER infer purchases from client plan.
-- Photo diagnosis: 5 included AI jobs per Istanbul day; verified rewarded credits
-- remain optional for extra work. PDF: one request per account / rolling 24h.

create or replace function public.check_ai_access()
returns table(allowed boolean, usage_id bigint, access_source text, plan text, daily_free_used boolean, free_remaining integer, reward_credits integer, unlimited boolean)
language plpgsql security definer set search_path=public,pg_temp
as $fn$
declare v_user uuid:=auth.uid(); v_count integer:=0; v_credits integer:=0; v_day date:=(now() at time zone 'Europe/Istanbul')::date;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select count(*)::integer into v_count from public.ai_usage
    where user_id=v_user and usage_date=v_day and access_source='free_daily';
  select coalesce(balance,0) into v_credits from public.ai_reward_credits where user_id=v_user;
  v_credits:=coalesce(v_credits,0);
  return query select (v_count<5 or v_credits>0), null::bigint,
    (case when v_count<5 then 'free_daily' when v_credits>0 then 'rewarded_ad' else null end)::text,
    'free'::text, (v_count>=5), greatest(0,5-v_count), v_credits, false;
end;$fn$;

create or replace function public.get_ai_access_status()
returns table(plan text, daily_free_used boolean, free_remaining integer, reward_credits integer, unlimited boolean)
language plpgsql security definer set search_path=public,pg_temp
as $fn$
declare v_user uuid:=auth.uid(); v_count integer:=0; v_credits integer:=0; v_day date:=(now() at time zone 'Europe/Istanbul')::date;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select count(*)::integer into v_count from public.ai_usage
    where user_id=v_user and usage_date=v_day and access_source='free_daily';
  select coalesce(balance,0) into v_credits from public.ai_reward_credits where user_id=v_user;
  return query select 'free'::text, (v_count>=5), greatest(0,5-v_count), coalesce(v_credits,0), false;
end;$fn$;

create or replace function public.consume_ai_access()
returns table(allowed boolean, usage_id bigint, access_source text, plan text, daily_free_used boolean, free_remaining integer, reward_credits integer, unlimited boolean)
language plpgsql security definer set search_path=public,pg_temp
as $fn$
declare v_user uuid:=auth.uid(); v_day date:=(now() at time zone 'Europe/Istanbul')::date;
  v_count integer:=0; v_credits integer:=0; v_usage_id bigint;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 5127));
  select count(*)::integer into v_count from public.ai_usage
    where user_id=v_user and usage_date=v_day and access_source='free_daily';
  if v_count<5 then
    insert into public.ai_usage(user_id,usage_date,access_source)
      values(v_user,v_day,'free_daily') returning id into v_usage_id;
    select coalesce(balance,0) into v_credits from public.ai_reward_credits where user_id=v_user;
    return query select true,v_usage_id,'free_daily'::text,'free'::text,(v_count+1>=5),4-v_count,coalesce(v_credits,0),false;
    return;
  end if;
  insert into public.ai_reward_credits(user_id,balance) values(v_user,0)
    on conflict(user_id) do nothing;
  select balance into v_credits from public.ai_reward_credits where user_id=v_user for update;
  if coalesce(v_credits,0)>0 then
    update public.ai_reward_credits set balance=balance-1,updated_at=now() where user_id=v_user;
    insert into public.ai_usage(user_id,usage_date,access_source)
      values(v_user,v_day,'rewarded_ad') returning id into v_usage_id;
    return query select true,v_usage_id,'rewarded_ad'::text,'free'::text,true,0,v_credits-1,false;
    return;
  end if;
  return query select false,null::bigint,null::text,'free'::text,true,0,0,false;
end;$fn$;

create or replace function public.request_pusulapdf(p_field_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $fn$
declare v_user uuid:=auth.uid(); v_running public.pusulapdf_jobs; v_report public.weekly_field_reports; v_job public.pusulapdf_jobs;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_field_id is null or not exists(select 1 from public.fields f where f.id=p_field_id and f.user_id=v_user) then
    raise exception 'FIELD_NOT_FOUND_OR_FORBIDDEN';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,4167));
  select * into v_running from public.pusulapdf_jobs
    where user_id=v_user and field_id=p_field_id and status in('queued','processing')
    order by created_at desc limit 1;
  if found then
    return jsonb_build_object('job_id',v_running.id,'report_id',v_running.report_id,'reused',true);
  end if;
  if exists(select 1 from public.pusulapdf_jobs where user_id=v_user and created_at>now()-interval '24 hours' and status in('queued','processing','ready')) then
    raise exception 'FREE_PDF_DAILY_LIMIT';
  end if;
  select * into v_report from public.weekly_field_reports
    where user_id=v_user and field_id=p_field_id and status='ready'
    order by period_end desc,created_at desc limit 1;
  insert into public.pusulapdf_jobs(user_id,field_id,report_id)
    values(v_user,p_field_id,v_report.id) returning * into v_job;
  return jsonb_build_object('job_id',v_job.id,'report_id',v_job.report_id,'reused',false);
end;$fn$;

create or replace function public.request_pusulapdf(p_field_id uuid,p_start_date date,p_end_date date)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $fn$
declare v_user uuid:=auth.uid(); v_active public.pusulapdf_jobs; v_existing_report public.weekly_field_reports;
  v_job public.pusulapdf_jobs; v_today date:=(now() at time zone 'Europe/Istanbul')::date;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_field_id is null or not exists(select 1 from public.fields f where f.id=p_field_id and f.user_id=v_user) then
    raise exception 'FIELD_NOT_FOUND_OR_FORBIDDEN';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date or p_end_date>v_today
    or (p_end_date-p_start_date+1)<7 or (p_end_date-p_start_date+1)>180 then
    raise exception 'INVALID_REPORT_PERIOD: Select 7 to 180 days ending today or earlier';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,4167));
  perform pg_advisory_xact_lock(hashtextextended(p_field_id::text,4166));
  select * into v_active from public.pusulapdf_jobs where user_id=v_user and field_id=p_field_id
    and status in('queued','processing') order by created_at desc limit 1 for update;
  if found then
    if v_active.requested_start is not distinct from p_start_date
       and v_active.requested_end is not distinct from p_end_date then
      return jsonb_build_object('job_id',v_active.id,'report_id',v_active.report_id,'reused',true);
    end if;
    raise exception 'REPORT_ALREADY_RUNNING';
  end if;
  if exists(select 1 from public.pusulapdf_jobs where user_id=v_user and created_at>now()-interval '24 hours' and status in('queued','processing','ready')) then
    raise exception 'FREE_PDF_DAILY_LIMIT';
  end if;
  select * into v_existing_report from public.weekly_field_reports
    where user_id=v_user and field_id=p_field_id and period_start=p_start_date
      and period_end=p_end_date and status='ready'
    order by created_at desc limit 1;
  insert into public.pusulapdf_jobs(user_id,field_id,report_id,requested_start,requested_end)
    values(v_user,p_field_id,v_existing_report.id,p_start_date,p_end_date) returning * into v_job;
  return jsonb_build_object('job_id',v_job.id,'report_id',v_job.report_id,'reused',false);
end;$fn$;

grant execute on function public.check_ai_access() to authenticated;
grant execute on function public.get_ai_access_status() to authenticated;
grant execute on function public.consume_ai_access() to authenticated;
grant execute on function public.request_pusulapdf(uuid) to authenticated;
grant execute on function public.request_pusulapdf(uuid,date,date) to authenticated;
