-- Internal maintenance / secret-check functions must not be callable through
-- the public REST API (anon or signed-in users). Edge functions call them with
-- the service role, which keeps its EXECUTE grant.
revoke execute on function public.invoke_published_content_image_repair(integer) from public, anon, authenticated;
revoke execute on function public.verify_content_image_secret(text) from public, anon, authenticated;
revoke execute on function public.verify_market_sync_secret(text) from public, anon, authenticated;
revoke execute on function public.verify_release_probe_secret(text) from public, anon, authenticated;

grant execute on function public.invoke_published_content_image_repair(integer) to service_role;
grant execute on function public.verify_content_image_secret(text) to service_role;
grant execute on function public.verify_market_sync_secret(text) to service_role;
grant execute on function public.verify_release_probe_secret(text) to service_role;

-- RevenueCat / paid plans were removed; the readiness helper is unused.
drop function if exists public.billing_backend_ready();
