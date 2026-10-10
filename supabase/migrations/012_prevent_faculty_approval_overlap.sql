-- Prevent any one faculty member from receiving overlapping course approvals.
CREATE OR REPLACE FUNCTION public.decide_course_preference(p_request_id bigint, p_approve boolean, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_request public.faculty_course_requests%rowtype;v_title text;v_block text;v_duration int;v_day int;v_days int[];
begin
 if not public.is_admin() then raise exception 'Administrator approval required';end if;
 if length(trim(coalesce(p_note,'')))<5 then raise exception 'Provide an administrative reason (at least 5 characters)';end if;
 select * into v_request from public.faculty_course_requests where id=p_request_id for update;
 if not found or v_request.status<>'pending' then raise exception 'Request is not pending';end if;
 if p_approve then
  perform pg_advisory_xact_lock(v_request.course_offering_id);
  if not exists(select 1 from public.course_offerings o
    join public.academic_terms t on t.id=o.academic_term_id and t.is_active=true
    where o.id=v_request.course_offering_id and o.status='available')
   then raise exception 'Offering is no longer available';end if;
  if exists(select 1 from public.faculty_course_requests where course_offering_id=v_request.course_offering_id and status='approved')
   then raise exception 'Another instructor has already been approved for this block course';end if;
  -- Serialize assignments for this instructor and term, not just the course offering.
  perform pg_advisory_xact_lock(hashtext(v_request.faculty_id::text),v_request.academic_term_id::integer);
  if v_request.preferred_pattern is not null then
   v_duration:=case v_request.preferred_pattern when 'NSTP' then 180 when 'PATHFIT' then 120 else 90 end;
   v_days:=case v_request.preferred_pattern
     when 'MW' then array[1,3] when 'TTH' then array[2,4]
     when 'NSTP' then array[5] else array[v_request.preferred_pathfit_weekday::integer] end;
   foreach v_day in array v_days loop
    if exists(
     select 1 from public.faculty_course_requests r
     where r.faculty_id=v_request.faculty_id
       and r.academic_term_id=v_request.academic_term_id
       and r.status='approved'
       and r.id<>v_request.id and r.preferred_pattern is not null
       and r.preferred_start_minute < v_request.preferred_start_minute+v_duration
       and r.preferred_start_minute + (case r.preferred_pattern when 'NSTP' then 180 when 'PATHFIT' then 120 else 90 end) > v_request.preferred_start_minute
       and (case r.preferred_pattern when 'MW' then v_day in (1,3)
            when 'TTH' then v_day in (2,4) when 'NSTP' then v_day=5
            else v_day=r.preferred_pathfit_weekday end)
    ) or exists(
     select 1 from public.schedule_meetings m
     where m.active and m.faculty_id=v_request.faculty_id and m.academic_term_id=v_request.academic_term_id
       and m.weekday=v_day and m.start_minute<v_request.preferred_start_minute+v_duration
       and m.end_minute>v_request.preferred_start_minute
    ) then
     raise exception 'Instructor schedule overlap on weekday %. Review the weekly schedule preview before approval.',v_day;
    end if;
   end loop;
  end if;
 end if;
 update public.faculty_course_requests set status=case when p_approve then 'approved' else 'rejected' end,
 decided_by=auth.uid(),decided_at=now(),decision_note=trim(p_note) where id=p_request_id;
 select c.course_code,s.block_label into v_title,v_block from public.course_offerings o
 join public.curriculum_courses c on c.id=o.curriculum_course_id
 join public.class_sections s on s.id=o.class_section_id where o.id=v_request.course_offering_id;
 if p_approve and v_request.preferred_pattern is not null then
  v_duration:=case v_request.preferred_pattern when 'NSTP' then 180 when 'PATHFIT' then 120 else 90 end;
  insert into public.schedule_proposals
  (course_request_id,academic_term_id,faculty_id,course_offering_id,venue_id,meeting_pattern,start_minute,duration_minutes,pathfit_weekday)
  values(v_request.id,v_request.academic_term_id,v_request.faculty_id,v_request.course_offering_id,
    v_request.preferred_venue_id,v_request.preferred_pattern,v_request.preferred_start_minute,v_duration,v_request.preferred_pathfit_weekday);
 end if;
 insert into public.faculty_notifications(recipient_id,title,body,related_request_id)
 values(v_request.faculty_id,case when p_approve then 'Course preference approved' else 'Course preference declined' end,
 format('%s — %s: %s',v_title,v_block,trim(p_note)),p_request_id);
end;$function$
;
