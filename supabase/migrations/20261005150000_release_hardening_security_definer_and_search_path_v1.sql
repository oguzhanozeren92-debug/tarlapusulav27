-- Release hardening: SECURITY DEFINER RPC exposure + mutable search_path.

revoke all on function public.invoke_content_reprocess_internal(uuid,uuid,boolean,boolean) from public;
revoke all on function public.invoke_content_reprocess_internal(uuid,uuid,boolean,boolean) from anon;
revoke all on function public.invoke_content_reprocess_internal(uuid,uuid,boolean,boolean) from authenticated;
grant execute on function public.invoke_content_reprocess_internal(uuid,uuid,boolean,boolean) to service_role;

revoke all on function public.tp_queue_content_candidate_assets() from public;
revoke all on function public.tp_queue_content_candidate_assets() from anon;
revoke all on function public.tp_queue_content_candidate_assets() from authenticated;
grant execute on function public.tp_queue_content_candidate_assets() to service_role;

revoke all on function public.tp_sensor_observation_after_insert() from public;
revoke all on function public.tp_sensor_observation_after_insert() from anon;
revoke all on function public.tp_sensor_observation_after_insert() from authenticated;
grant execute on function public.tp_sensor_observation_after_insert() to service_role;

revoke all on function public.is_admin() from public;
revoke all on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_admin() to service_role;

revoke all on function public.request_pusulapdf(uuid) from public;
revoke all on function public.request_pusulapdf(uuid) from anon;
grant execute on function public.request_pusulapdf(uuid) to authenticated;
grant execute on function public.request_pusulapdf(uuid) to service_role;

revoke all on function public.tp_award_points(text,text,jsonb) from public;
revoke all on function public.tp_award_points(text,text,jsonb) from anon;
grant execute on function public.tp_award_points(text,text,jsonb) to authenticated;
grant execute on function public.tp_award_points(text,text,jsonb) to service_role;

revoke all on function public.tp_find_cached_ai_image_analysis(uuid,text,text,text,text) from public;
revoke all on function public.tp_find_cached_ai_image_analysis(uuid,text,text,text,text) from anon;
grant execute on function public.tp_find_cached_ai_image_analysis(uuid,text,text,text,text) to authenticated;
grant execute on function public.tp_find_cached_ai_image_analysis(uuid,text,text,text,text) to service_role;

alter function public.tp_norm_vision_label(text) set search_path = public, pg_temp;
alter function public.tp_vision_alias_match(text,text,text[]) set search_path = public, pg_temp;
