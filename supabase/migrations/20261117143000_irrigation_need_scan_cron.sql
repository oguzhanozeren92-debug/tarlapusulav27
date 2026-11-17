-- Sulama ihtiyacı taraması: 30 dakikada bir (fonksiyon yalnız 07-19 arası iş yapar,
-- her tarlayı günde en fazla bir kez kontrol eder).
select cron.unschedule(jobid) from cron.job where jobname = 'tarlapusula-irrigation-need-scan';
select cron.schedule(
  'tarlapusula-irrigation-need-scan', '7,37 * * * *',
  $cron$select net.http_post(
    url := 'https://xwyfidtktauxivsosmex.supabase.co/functions/v1/irrigation-water-balance-state',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (select secret from private.scheduler_secrets where name = 'push_dispatch')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );$cron$
);
