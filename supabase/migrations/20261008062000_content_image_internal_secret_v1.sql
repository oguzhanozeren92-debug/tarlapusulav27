insert into private.scheduler_secrets(name, secret, created_at, updated_at)
values ('content_image', encode(gen_random_bytes(32), 'hex'), now(), now())
on conflict (name) do update set updated_at = now();

create or replace function public.verify_content_image_secret(p_secret text)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select exists(
    select 1 from private.scheduler_secrets
    where name='content_image' and secret=p_secret
  );
$$;
revoke all on function public.verify_content_image_secret(text) from public;
grant execute on function public.verify_content_image_secret(text) to service_role;
