-- PusulaPDF: explicit report period. Existing reports and old API are preserved.
ALTER TABLE public.pusulapdf_jobs
  ADD COLUMN IF NOT EXISTS requested_start date,
  ADD COLUMN IF NOT EXISTS requested_end date;

-- Custom ranges can share a start date but have different end dates.
ALTER TABLE public.weekly_field_reports
  DROP CONSTRAINT IF EXISTS weekly_field_reports_one_per_week;
ALTER TABLE public.weekly_field_reports
  ADD CONSTRAINT weekly_field_reports_unique_period
  UNIQUE (user_id, field_id, period_start, period_end);

CREATE OR REPLACE FUNCTION public.request_pusulapdf(
  p_field_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_plan text;
  v_active public.pusulapdf_jobs;
  v_existing_report public.weekly_field_reports;
  v_job public.pusulapdf_jobs;
  v_today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  IF p_field_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.fields f
    WHERE f.id = p_field_id AND f.user_id = v_user
  ) THEN
    RAISE EXCEPTION 'FIELD_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL
     OR p_end_date < p_start_date
     OR p_end_date > v_today
     OR (p_end_date - p_start_date + 1) < 7
     OR (p_end_date - p_start_date + 1) > 180 THEN
    RAISE EXCEPTION 'INVALID_REPORT_PERIOD: Select 7 to 180 days ending today or earlier';
  END IF;

  SELECT COALESCE(p.subscription_plan, 'free') INTO v_plan
  FROM public.profiles p WHERE p.id = v_user;

  IF COALESCE(v_plan, 'free') <> 'premium' AND NOT EXISTS (
    SELECT 1 FROM public.admin_users au WHERE au.user_id = v_user
  ) THEN
    RAISE EXCEPTION 'PREMIUM_REQUIRED';
  END IF;

  -- Serialize report requests per field. Never reuse a running job for
  -- another selected date range, or show someone a mismatched report.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_field_id::text, 4166));

  SELECT * INTO v_active
  FROM public.pusulapdf_jobs
  WHERE user_id = v_user AND field_id = p_field_id
    AND status IN ('queued','processing')
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF v_active.requested_start IS NOT DISTINCT FROM p_start_date
       AND v_active.requested_end IS NOT DISTINCT FROM p_end_date THEN
      RETURN jsonb_build_object('job_id',v_active.id,'report_id',v_active.report_id,'reused',true);
    END IF;
    RAISE EXCEPTION 'REPORT_ALREADY_RUNNING';
  END IF;

  SELECT * INTO v_existing_report FROM public.weekly_field_reports
  WHERE user_id = v_user AND field_id = p_field_id
    AND period_start = p_start_date AND period_end = p_end_date
    AND status = 'ready'
  ORDER BY created_at DESC LIMIT 1;

  -- Snapshot is updated only after the full requested processing completed.
  INSERT INTO public.pusulapdf_jobs
    (user_id,field_id,report_id,requested_start,requested_end)
  VALUES (v_user,p_field_id,v_existing_report.id,p_start_date,p_end_date)
  RETURNING * INTO v_job;
  RETURN jsonb_build_object('job_id',v_job.id,'report_id',v_job.report_id,'reused',false);
END;
$function$;

REVOKE ALL ON FUNCTION public.request_pusulapdf(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_pusulapdf(uuid,date,date) TO authenticated, service_role;

COMMENT ON FUNCTION public.request_pusulapdf(uuid,date,date)
IS 'Authenticated field owner with Premium or authorized admin, for verified 7-180 day report ranges. Dates stored on the job.';
