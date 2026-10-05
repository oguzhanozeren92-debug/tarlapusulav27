alter table public.ai_image_analysis_jobs
  add column if not exists photo_hash text;

create index if not exists ai_image_analysis_jobs_photo_cache_idx
  on public.ai_image_analysis_jobs(
    user_id,
    field_id,
    photo_hash,
    task_type,
    completed_at desc
  )
  where status = 'completed'
    and analysis is not null
    and photo_hash is not null;

create or replace function public.tp_find_cached_ai_image_analysis(
  p_field_id uuid,
  p_photo_hash text,
  p_task_type text default 'disease_pest_diagnosis',
  p_notes text default null,
  p_crop text default null
)
returns table(
  job_id uuid,
  analysis jsonb,
  provider text,
  model text,
  completed_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    j.id,
    j.analysis,
    j.provider,
    j.model,
    j.completed_at
  from public.ai_image_analysis_jobs j
  where j.user_id = auth.uid()
    and j.field_id = p_field_id
    and j.status = 'completed'
    and j.analysis is not null
    and j.photo_hash = nullif(trim(p_photo_hash), '')
    and coalesce(j.task_type, 'disease_pest_diagnosis')
        = coalesce(nullif(trim(p_task_type), ''), 'disease_pest_diagnosis')
    and lower(coalesce(trim(j.crop), ''))
        = lower(coalesce(trim(p_crop), ''))
    and coalesce(trim(j.notes), '')
        = coalesce(trim(p_notes), '')
  order by j.completed_at desc nulls last
  limit 1;
$$;

grant execute on function public.tp_find_cached_ai_image_analysis(uuid,text,text,text,text)
to authenticated;
