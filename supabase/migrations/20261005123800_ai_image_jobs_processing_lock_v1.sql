update public.ai_image_analysis_jobs
set
  status = 'failed',
  error_message = coalesce(error_message, 'Önceki bekleyen analiz kapatıldı.'),
  updated_at = now()
where status = 'pending'
  and created_at < now() - interval '90 seconds';

drop index if exists public.ai_image_analysis_jobs_one_active_per_user_idx;

create unique index if not exists ai_image_analysis_jobs_one_processing_per_user_idx
  on public.ai_image_analysis_jobs(user_id)
  where status = 'processing';
