-- Faculty General Information: approved course ownership and existing room occupancy.
CREATE OR REPLACE FUNCTION public.general_information_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_term bigint;v_result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='active') then
  raise exception 'Active PSU faculty account required';
 end if;
 select t.id into v_term from public.academic_terms t where t.is_active=true order by t.id desc limit 1;
 if v_term is null then
  return jsonb_build_object('term_id',null,'assignments','[]'::jsonb,'bookings','[]'::jsonb);
 end if;
 select jsonb_build_object(
  'term_id',v_term,
  'assignments',coalesce((
   select jsonb_agg(jsonb_build_object(
    'offering_id',o.id,'course_code',c.course_code,'course_title',c.course_title,
    'block',s.block_label,'program',s.program,'faculty_name',trim(concat_ws(' ',p.first_name,p.middle_initial,p.last_name)),
    'status','approved','pending_count',(
      select count(*) from public.faculty_course_requests r2 where r2.course_offering_id=o.id and r2.status='pending'
    )
   ) order by s.block_label,c.course_code)
   from public.faculty_course_requests r
   join public.course_offerings o on o.id=r.course_offering_id
   join public.curriculum_courses c on c.id=o.curriculum_course_id
   join public.class_sections s on s.id=o.class_section_id
   join public.profiles p on p.id=r.faculty_id
   where r.academic_term_id=v_term and r.status='approved'
  ),'[]'::jsonb),
  'bookings',coalesce((
   select jsonb_agg(jsonb_build_object(
    'meeting_id',m.id,'weekday',m.weekday,'start_minute',m.start_minute,'end_minute',m.end_minute,
    'venue_id',m.venue_id,'venue_name',v.name,'course_code',c.course_code,
    'block',s.block_label,'faculty_name',trim(concat_ws(' ',p.first_name,p.middle_initial,p.last_name)),
    'publication_status',case when pub.academic_term_id is null then 'approved_draft' else 'published' end
   ) order by m.weekday,m.start_minute,v.name)
   from public.schedule_meetings m
   join public.schedule_venues v on v.id=m.venue_id
   join public.course_offerings o on o.id=m.course_offering_id
   join public.curriculum_courses c on c.id=o.curriculum_course_id
   join public.class_sections s on s.id=m.class_section_id
   join public.profiles p on p.id=m.faculty_id
   left join public.schedule_publications pub on pub.academic_term_id=m.academic_term_id
   where m.academic_term_id=v_term and m.active=true
  ),'[]'::jsonb)
 ) into v_result;
 return v_result;
end;$function$
;
revoke all on function public.general_information_snapshot() from public;
grant execute on function public.general_information_snapshot() to authenticated;
