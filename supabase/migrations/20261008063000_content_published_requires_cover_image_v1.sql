create or replace function public.tp_require_published_content_cover_image()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if new.status='published' then
    if not exists (
      select 1
      from public.content_images img
      where img.content_id=new.id
        and img.status<>'rejected'
        and img.is_cover=true
    ) then
      raise exception 'Published content requires an approved cover image.'
        using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_content_items_require_cover_image on public.content_items;
create trigger trg_content_items_require_cover_image
before insert or update of status on public.content_items
for each row
execute function public.tp_require_published_content_cover_image();
