-- TarlaPusula: queue one opt-in news/article notification only on first publication.
-- Existing 15-minute send-due-reminders dispatcher enforces quiet hours and 3/day limit.
-- No past content backfill; re-edits to published content do not send again.
create schema if not exists private;
create or replace function private.tp_queue_fresh_content_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_article boolean;
begin
  if new.status <> 'published'
     or (new.content_type <> 'news'
       and not (new.content_type = 'knowledge' and new.content_subtype = 'article'))
     or (tg_op = 'UPDATE' and old.status = 'published') then
    return new;
  end if;

  is_article := new.content_type = 'knowledge' and new.content_subtype = 'article';

  insert into public.app_notifications
    (user_id,kind,source,severity,title,message,target,data,
      category,push_eligible,push_critical,push_available_at,dedupe_key)
  select
    subscribers.user_id,
    case when is_article then 'published_article' else 'published_news' end,
    'published_content',
    'info',
    case when is_article then 'Yeni makale 📖' else 'Yeni tarım haberi 📰' end,
    left(new.title, 180) || ' • Okumak ister misin?',
    'notificationsHub',
    jsonb_build_object('contentId',new.id,'actionTarget',
      case when is_article then 'articles' else 'news' end),
    'news',true,false,now(),
    'published-content:' || subscribers.user_id::text || ':' || new.id::text
  from (
    select distinct user_id from public.push_subscriptions where enabled = true
    union
    select distinct user_id from public.native_push_tokens where enabled = true
  ) subscribers
  left join public.user_notification_preferences prefs
    on prefs.user_id = subscribers.user_id
  where coalesce(prefs.push_enabled,true) = true
    and coalesce(prefs.news_enabled,true) = true
    and not exists (
      select 1 from public.app_notifications prior
       where prior.user_id = subscribers.user_id
         and prior.category = 'news'
         and prior.created_at >= now() - interval '24 hours'
    )
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

revoke all on function private.tp_queue_fresh_content_notification()
  from public, anon, authenticated;
drop trigger if exists trg_tp_queue_fresh_content_push on public.content_items;
create trigger trg_tp_queue_fresh_content_push
after insert or update of status on public.content_items
for each row execute function private.tp_queue_fresh_content_notification();
