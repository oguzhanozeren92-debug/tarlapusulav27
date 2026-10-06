-- Native iOS/Android push registration for TarlaPusula mobile shell.
-- Web Push stays in public.push_subscriptions; native APNs/FCM tokens live here.

create table if not exists public.native_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  installation_id text not null,
  token text not null,
  environment text not null default 'production'
    check (environment in ('sandbox', 'production')),
  enabled boolean not null default true,
  app_id text not null default 'com.tarlapusula.app',
  app_version text,
  user_agent text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform, installation_id)
);

create unique index if not exists uq_native_push_tokens_platform_token
  on public.native_push_tokens(platform, token);

create index if not exists idx_native_push_tokens_user_enabled
  on public.native_push_tokens(user_id, enabled)
  where enabled = true;

alter table public.native_push_tokens enable row level security;

drop policy if exists "native push own select" on public.native_push_tokens;
create policy "native push own select"
  on public.native_push_tokens for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "native push own insert" on public.native_push_tokens;
create policy "native push own insert"
  on public.native_push_tokens for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "native push own update" on public.native_push_tokens;
create policy "native push own update"
  on public.native_push_tokens for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "native push own delete" on public.native_push_tokens;
create policy "native push own delete"
  on public.native_push_tokens for delete to authenticated
  using (auth.uid() = user_id);

comment on table public.native_push_tokens is
  'Native Capacitor push device registrations. APNs token on iOS, FCM token on Android.';
