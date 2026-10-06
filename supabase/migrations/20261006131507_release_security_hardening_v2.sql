create or replace function public.request_pusulapdf(p_field_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_plan text;
  v_existing_job public.pusulapdf_jobs;
  v_report public.weekly_field_reports;
  v_job public.pusulapdf_jobs;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_field_id is null or not exists (
    select 1
    from public.fields f
    where f.id = p_field_id
      and f.user_id = v_user
  ) then
    raise exception 'FIELD_NOT_FOUND_OR_FORBIDDEN';
  end if;

  select coalesce(p.subscription_plan, 'free')
    into v_plan
  from public.profiles p
  where p.id = v_user;

  if coalesce(v_plan, 'free') <> 'premium' then
    raise exception 'PREMIUM_REQUIRED';
  end if;

  select * into v_existing_job
  from public.pusulapdf_jobs
  where user_id = v_user
    and field_id = p_field_id
    and status in ('queued','processing')
  order by created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'job_id', v_existing_job.id,
      'report_id', v_existing_job.report_id,
      'reused', true
    );
  end if;

  select * into v_report
  from public.weekly_field_reports
  where user_id = v_user
    and field_id = p_field_id
    and status = 'ready'
  order by period_end desc, created_at desc
  limit 1;

  insert into public.pusulapdf_jobs(user_id, field_id, report_id)
  values (v_user, p_field_id, v_report.id)
  returning * into v_job;

  return jsonb_build_object(
    'job_id', v_job.id,
    'report_id', v_job.report_id,
    'reused', false
  );
end;
$$;

grant execute on function public.request_pusulapdf(uuid) to authenticated;

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
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_state record;
  v_allowed boolean := false;
  v_reason text := 'server_verification_required';
  v_canonical_dedupe text;
  v_safe_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_product_id uuid;
  v_analysis_id uuid;
  v_field_id uuid;
  v_point_id uuid;
  v_activity_id uuid;
  v_photo_hash text;
  v_photo_satellite_date date;
  v_photo_captured_at timestamptz;
  v_requested_satellite_date date;
  v_requested_captured_at timestamptz;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  if p_rule_key = 'WATCH_AD' then
    v_reason := 'verified_ad_required';

  elsif p_rule_key = 'DAILY_LOGIN' then
    v_allowed := true;
    v_canonical_dedupe :=
      'daily-login:' || ((now() at time zone 'Europe/Istanbul')::date)::text;
    v_safe_metadata := jsonb_build_object(
      'source', 'app_boot',
      'localDate', ((now() at time zone 'Europe/Istanbul')::date)::text,
      'serverVerified', true
    );

  elsif p_rule_key = 'ADD_INVENTORY' then
    begin
      v_product_id := nullif(v_safe_metadata->>'productId', '')::uuid;
    exception when others then
      v_product_id := null;
    end;

    if v_product_id is not null and exists (
      select 1
      from public.farm_inventory_products p
      where p.id = v_product_id
        and p.user_id = v_user
    ) then
      v_allowed := true;
      v_canonical_dedupe := 'inventory:' || v_product_id::text;
      v_safe_metadata := v_safe_metadata || jsonb_build_object(
        'productId', v_product_id,
        'serverVerified', true
      );
    else
      v_reason := 'inventory_record_not_verified';
    end if;

  elsif p_rule_key = 'ADD_SOIL_ANALYSIS' then
    begin
      v_analysis_id := nullif(v_safe_metadata->>'analysisId', '')::uuid;
    exception when others then
      v_analysis_id := null;
    end;

    if v_analysis_id is not null and exists (
      select 1
      from public.soil_analyses s
      where s.id = v_analysis_id
        and s.user_id = v_user
        and s.status is not null
    ) then
      v_allowed := true;
      v_canonical_dedupe := 'soil-analysis:' || v_analysis_id::text;
      v_safe_metadata := v_safe_metadata || jsonb_build_object(
        'analysisId', v_analysis_id,
        'serverVerified', true
      );
    else
      v_reason := 'soil_analysis_not_verified';
    end if;

  elsif p_rule_key = 'PEST_ANALYSIS' then
    begin
      v_field_id := nullif(v_safe_metadata->>'fieldId', '')::uuid;
    exception when others then
      v_field_id := null;
    end;
    v_photo_hash := nullif(trim(v_safe_metadata->>'photoHash'), '');

    if v_field_id is not null
       and v_photo_hash is not null
       and exists (
         select 1
         from public.ai_image_analysis_jobs j
         where j.user_id = v_user
           and j.field_id = v_field_id
           and j.photo_hash = v_photo_hash
           and j.status = 'completed'
           and j.analysis is not null
       ) then
      v_allowed := true;
      v_canonical_dedupe :=
        'pest-analysis:' || v_field_id::text || ':' || v_photo_hash;
      v_safe_metadata := v_safe_metadata || jsonb_build_object(
        'fieldId', v_field_id,
        'photoHash', v_photo_hash,
        'serverVerified', true
      );
    else
      v_reason := 'pest_analysis_not_verified';
    end if;

  elsif p_rule_key = 'FIELD_OBSERVATION_PHOTO' then
    begin
      v_point_id := nullif(v_safe_metadata->>'pointId', '')::uuid;
    exception when others then
      v_point_id := null;
    end;
    begin
      v_field_id := nullif(v_safe_metadata->>'fieldId', '')::uuid;
    exception when others then
      v_field_id := null;
    end;
    begin
      v_requested_satellite_date :=
        nullif(v_safe_metadata->>'satelliteDate', '')::date;
    exception when others then
      v_requested_satellite_date := null;
    end;
    begin
      v_requested_captured_at :=
        nullif(v_safe_metadata->>'capturedAt', '')::timestamptz;
    exception when others then
      v_requested_captured_at := null;
    end;

    if v_point_id is not null and v_field_id is not null then
      select p.satellite_date, p.captured_at
        into v_photo_satellite_date, v_photo_captured_at
      from public.field_observation_photos p
      where p.user_id = v_user
        and p.point_id = v_point_id
        and p.field_id = v_field_id
        and (
          (v_requested_satellite_date is not null
            and p.satellite_date = v_requested_satellite_date)
          or
          (v_requested_satellite_date is null
            and v_requested_captured_at is not null
            and abs(extract(epoch from (p.captured_at - v_requested_captured_at))) <= 300)
        )
      order by p.captured_at desc
      limit 1;

      if found then
        v_allowed := true;
        v_canonical_dedupe :=
          'field-observation-photo:' || v_point_id::text || ':' ||
          coalesce(
            v_photo_satellite_date::text,
            ((v_photo_captured_at at time zone 'Europe/Istanbul')::date)::text
          );
        v_safe_metadata := v_safe_metadata || jsonb_build_object(
          'pointId', v_point_id,
          'fieldId', v_field_id,
          'serverVerified', true
        );
      else
        v_reason := 'field_observation_photo_not_verified';
      end if;

    else
      begin
        v_activity_id := nullif(v_safe_metadata->>'activityId', '')::uuid;
      exception when others then
        v_activity_id := null;
      end;

      if v_activity_id is not null and exists (
        select 1
        from public.activities a
        where a.id = v_activity_id
          and a.user_id = v_user
          and a.activity_type = 'Saha Kontrolü'
          and nullif(trim(a.photo_path), '') is not null
      ) then
        v_allowed := true;
        v_canonical_dedupe := 'field-history:' || v_activity_id::text;
        v_safe_metadata := v_safe_metadata || jsonb_build_object(
          'activityId', v_activity_id,
          'serverVerified', true
        );
      else
        v_reason := 'field_observation_photo_not_verified';
      end if;
    end if;

  else
    v_reason := 'server_verification_required';
  end if;

  if not v_allowed then
    select * into v_state
    from public.tp_get_gamification_state();

    return query
    select
      false,
      0,
      p_rule_key,
      v_reason,
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
    v_canonical_dedupe,
    v_safe_metadata
  );
end;
$$;

revoke all on function public.tp_award_points(text,text,jsonb) from public;
revoke all on function public.tp_award_points(text,text,jsonb) from anon;
grant execute on function public.tp_award_points(text,text,jsonb) to authenticated;
grant execute on function public.tp_award_points(text,text,jsonb) to service_role;

revoke all on function public.tp_assign_field_sort_order() from public;
revoke all on function public.tp_assign_field_sort_order() from anon;
revoke all on function public.tp_assign_field_sort_order() from authenticated;
grant execute on function public.tp_assign_field_sort_order() to service_role;
