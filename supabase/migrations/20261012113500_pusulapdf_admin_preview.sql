-- Allow the single authorized TarlaPusula admin to test PusulaPDF without
-- altering a customer's paid subscription. Ordinary Free/Plus users remain blocked.
-- Authorization is performed with auth.uid() and a server-controlled admin_users row.
CREATE OR REPLACE FUNCTION public.request_pusulapdf(p_field_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_plan text;
  v_existing_job public.pusulapdf_jobs;
  v_report public.weekly_field_reports;
  v_job public.pusulapdf_jobs;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF p_field_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.fields f
    WHERE f.id = p_field_id AND f.user_id = v_user
  ) THEN
    RAISE EXCEPTION 'FIELD_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  SELECT COALESCE(p.subscription_plan, 'free')
    INTO v_plan
  FROM public.profiles p
  WHERE p.id = v_user;

  -- A UI "TEST PREMIUM" toggle is not proof of a purchase.
  -- An authenticated member of public.admin_users may run genuine reports for
  -- their own fields for release testing. This never upgrades other accounts.
  IF COALESCE(v_plan, 'free') <> 'premium'
     AND NOT EXISTS (
       SELECT 1 FROM public.admin_users au WHERE au.user_id = v_user
     ) THEN
    RAISE EXCEPTION 'PREMIUM_REQUIRED';
  END IF;

  SELECT * INTO v_existing_job
  FROM public.pusulapdf_jobs
  WHERE user_id = v_user AND field_id = p_field_id
    AND status IN ('queued', 'processing')
  ORDER BY created_at DESC LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'job_id', v_existing_job.id,
      'report_id', v_existing_job.report_id,
      'reused', true
    );
  END IF;

  SELECT * INTO v_report
  FROM public.weekly_field_reports
  WHERE user_id = v_user AND field_id = p_field_id
    AND status = 'ready'
  ORDER BY period_end DESC, created_at DESC LIMIT 1;

  INSERT INTO public.pusulapdf_jobs(user_id, field_id, report_id)
  VALUES (v_user, p_field_id, v_report.id)
  RETURNING * INTO v_job;

  RETURN jsonb_build_object(
    'job_id', v_job.id,
    'report_id', v_job.report_id,
    'reused', false
  );
END;
$function$;

COMMENT ON FUNCTION public.request_pusulapdf(uuid)
IS 'Queues PusulaPDF for the authenticated owner of a field with a real Premium plan, or for an explicitly authorized TarlaPusula admin testing their own field.';
