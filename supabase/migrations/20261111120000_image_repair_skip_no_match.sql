-- Konuya uygun görsel bulunamayan (no_match) yayınları her 20 dakikada değil, haftada bir yeniden dene.
CREATE OR REPLACE FUNCTION public.invoke_published_content_image_repair(p_images integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'net', 'pg_temp'
AS $function$
declare
  s text;
  r record;
  req bigint;
  n int := 0;
begin
  select secret into s from private.scheduler_secrets where name='content_engine_daily';
  if coalesce(s,'')='' then raise exception 'content scheduler secret missing'; end if;

  for r in
    select ci.id
    from public.content_items ci
    where ci.status='published'
      and not exists (
        select 1 from public.content_images img
        where img.content_id=ci.id and img.status<>'rejected'
      )
      and (ci.image_processing_at is null or ci.image_processing_at < now()-interval '20 minutes')
      and not (coalesce(ci.image_status,'')='no_match' and ci.image_processing_at > now()-interval '7 days')
    order by ci.published_at desc nulls last
    limit greatest(1,least(coalesce(p_images,3),6))
  loop
    update public.content_items set image_status='processing', image_processing_at=now() where id=r.id;
    select net.http_post(
      url:='https://xwyfidtktauxivsosmex.supabase.co/functions/v1/content-image-job',
      headers:=jsonb_build_object('Content-Type','application/json','x-cron-token',s),
      body:=jsonb_build_object('contentId',r.id,'maxImages',1),
      timeout_milliseconds:=60000
    ) into req;
    n:=n+1;
  end loop;

  return jsonb_build_object('images_queued',n);
end;
$function$;
