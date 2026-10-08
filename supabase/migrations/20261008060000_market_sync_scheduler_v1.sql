insert into private.scheduler_secrets(name, secret, created_at, updated_at)
values ('market_sync', encode(gen_random_bytes(32), 'hex'), now(), now())
on conflict (name) do update set updated_at = now();

create or replace function public.verify_market_sync_secret(p_secret text)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1 from private.scheduler_secrets
    where name = 'market_sync' and secret = p_secret
  );
$$;
revoke all on function public.verify_market_sync_secret(text) from public;
grant execute on function public.verify_market_sync_secret(text) to service_role;

do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname in (
    'market-tobb-catalog-weekly',
    'market-tobb-batch-0',
    'market-tobb-batch-60',
    'market-tobb-batch-120',
    'market-tobb-batch-180',
    'market-fertilizer-daily'
  );
end $$;

select cron.schedule(
  'market-tobb-catalog-weekly','20 2 * * 1',
  $cron$select net.http_post(
    url := 'https://xwyfidtktauxivsosmex.supabase.co/functions/v1/market-sync-dispatch',
    headers := jsonb_build_object('Content-Type','application/json','x-market-cron-secret',(select secret from private.scheduler_secrets where name='market_sync')),
    body := '{"action":"tobb_catalog"}'::jsonb,
    timeout_milliseconds := 120000
  );$cron$
);
select cron.schedule(
  'market-tobb-batch-0','35 2 * * *',
  $cron$select net.http_post(
    url := 'https://xwyfidtktauxivsosmex.supabase.co/functions/v1/market-sync-dispatch',
    headers := jsonb_build_object('Content-Type','application/json','x-market-cron-secret',(select secret from private.scheduler_secrets where name='market_sync')),
    body := '{"action":"tobb_batch","offset":0,"limit":60}'::jsonb,
    timeout_milliseconds := 120000
  );$cron$
);
select cron.schedule(
  'market-tobb-batch-60','50 2 * * *',
  $cron$select net.http_post(
    url := 'https://xwyfidtktauxivsosmex.supabase.co/functions/v1/market-sync-dispatch',
    headers := jsonb_build_object('Content-Type','application/json','x-market-cron-secret',(select secret from private.scheduler_secrets where name='market_sync')),
    body := '{"action":"tobb_batch","offset":60,"limit":60}'::jsonb,
    timeout_milliseconds := 120000
  );$cron$
);
select cron.schedule(
  'market-tobb-batch-120','5 3 * * *',
  $cron$select net.http_post(
    url := 'https://xwyfidtktauxivsosmex.supabase.co/functions/v1/market-sync-dispatch',
    headers := jsonb_build_object('Content-Type','application/json','x-market-cron-secret',(select secret from private.scheduler_secrets where name='market_sync')),
    body := '{"action":"tobb_batch","offset":120,"limit":60}'::jsonb,
    timeout_milliseconds := 120000
  );$cron$
);
select cron.schedule(
  'market-tobb-batch-180','20 3 * * *',
  $cron$select net.http_post(
    url := 'https://xwyfidtktauxivsosmex.supabase.co/functions/v1/market-sync-dispatch',
    headers := jsonb_build_object('Content-Type','application/json','x-market-cron-secret',(select secret from private.scheduler_secrets where name='market_sync')),
    body := '{"action":"tobb_batch","offset":180,"limit":60}'::jsonb,
    timeout_milliseconds := 120000
  );$cron$
);
select cron.schedule(
  'market-fertilizer-daily','40 5 * * *',
  $cron$select net.http_post(
    url := 'https://xwyfidtktauxivsosmex.supabase.co/functions/v1/market-sync-dispatch',
    headers := jsonb_build_object('Content-Type','application/json','x-market-cron-secret',(select secret from private.scheduler_secrets where name='market_sync')),
    body := '{"action":"fertilizer"}'::jsonb,
    timeout_milliseconds := 120000
  );$cron$
);
