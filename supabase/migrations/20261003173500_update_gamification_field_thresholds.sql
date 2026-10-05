update public.gamification_field_thresholds
set required_points = case field_number
  when 2 then 500
  when 3 then 1200
  else required_points
end,
updated_at = now()
where field_number in (2,3);
