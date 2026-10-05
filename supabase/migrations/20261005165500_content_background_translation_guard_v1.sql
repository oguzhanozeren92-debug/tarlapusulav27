create or replace function public.tp_content_candidate_admin_queue_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_structured jsonb := coalesce(new.structured_body, '{}'::jsonb);
  v_translation text := lower(coalesce(v_structured->>'translation_status', ''));
  v_summary_status text := lower(coalesce(v_structured->>'producer_summary_status', ''));
  v_lang text := lower(coalesce(new.original_language, ''));
  v_article boolean :=
    coalesce(new.content_subtype, '') = 'article'
    or lower(coalesce(v_structured->>'channel', '')) = 'article';
  v_visible_text text :=
    lower(coalesce(new.title_suggested, '') || ' ' || coalesce(new.short_summary, ''));
  v_process_artifact boolean := false;
begin
  if not v_article then
    return new;
  end if;

  v_process_artifact :=
       v_visible_text ~ '(yabancı bilimsel|yabancı dil|foreign language).*(türkç|çeviri|translation)'
    or v_visible_text ~ '(türkçeleştirilmeden|türkçeleştirilmeyen|çeviri eksik|çeviri yapılmadan)'
    or v_visible_text ~ '(admin kuyruğ|yayınlanamaz|yayına konulamaz|yayınlama engeli)'
    or v_visible_text ~ '(translation policy|publication block)';

  if v_process_artifact then
    new.workflow_status := 'rejected';
    new.payload_status := case
      when coalesce(new.payload_status, '') = 'processing' then 'error'
      else coalesce(new.payload_status, 'error')
    end;
    new.admin_note := 'background_guard: Çeviri/işlem açıklaması gerçek içerik adayı değildir; admin kuyruğundan otomatik gizlendi.';
    new.structured_body :=
      v_structured
      || jsonb_build_object(
        'admin_visibility', 'background_only',
        'queue_block_reason', 'translation_process_artifact'
      );
    return new;
  end if;

  if v_lang <> '' and v_lang <> 'tr' then
    if v_translation not in ('translated', 'translated_full_tr', 'not_needed', 'not_required')
       or (v_summary_status <> '' and v_summary_status not in ('ready', 'not_needed', 'not_required')) then
      if new.workflow_status = 'pending' then
        new.workflow_status := 'held';
      end if;

      new.admin_note := 'background_guard: Yabancı bilimsel içerik tam Türkçeleştirilmeden admin kuyruğuna açılmaz.';
      new.structured_body :=
        v_structured
        || jsonb_build_object(
          'admin_visibility', 'background_only',
          'queue_block_reason', 'translation_incomplete'
        );
    else
      new.structured_body :=
        v_structured
        || jsonb_build_object('admin_visibility', 'admin_ready')
        - 'queue_block_reason';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_content_candidate_admin_queue_guard
on public.content_candidates;

create trigger trg_content_candidate_admin_queue_guard
before insert or update
on public.content_candidates
for each row
execute function public.tp_content_candidate_admin_queue_guard();
