-- Guided schedule/room preferences captured at faculty course request time.
alter table public.faculty_course_requests
 add column preferred_pattern text check(preferred_pattern in ('MW','TTH','PATHFIT','NSTP')),
 add column preferred_start_minute integer,
 add column preferred_pathfit_weekday smallint check(preferred_pathfit_weekday between 1 and 5),
 add column preferred_venue_id bigint references public.schedule_venues(id),
 add constraint preference_schedule_complete check(
 (preferred_pattern is null and preferred_start_minute is null and preferred_pathfit_weekday is null and preferred_venue_id is null)
 or (preferred_pattern is not null and preferred_start_minute is not null and preferred_venue_id is not null
 and ((preferred_pattern='PATHFIT')=(preferred_pathfit_weekday is not null)))
 );

CREATE OR REPLACE FUNCTION public.decide_course_preference(p_request_id bigint, p_approve boolean, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_request public.faculty_course_requests%rowtype;v_title text;v_block text;v_duration int;
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

CREATE OR REPLACE FUNCTION public.request_course_with_schedule(p_offering_id bigint, p_rank integer, p_motivation text, p_pattern text, p_start_minute integer, p_venue_id bigint, p_pathfit_day integer DEFAULT NULL::integer)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid();v_term bigint;v_request_id bigint;v_code text;v_units numeric;v_duration integer;
begin
 if not exists(select 1 from public.profiles where id=v_uid and status='active') then raise exception 'Active faculty account required';end if;
 if p_rank not between 1 and 10 then raise exception 'Rank must be 1–10';end if;
 if length(coalesce(p_motivation,''))>1000 then raise exception 'Reason too long';end if;
 select o.academic_term_id,upper(regexp_replace(c.course_code,'[[:space:]]+','','g')),c.units
 into v_term,v_code,v_units
 from public.course_offerings o
 join public.academic_terms t on t.id=o.academic_term_id and t.is_active=true
 join public.class_sections s on s.id=o.class_section_id and s.active=true and s.academic_year=t.academic_year
 join public.curriculum_courses c on c.id=o.curriculum_course_id and c.curriculum_id=s.curriculum_id and c.year_level=s.year_level and c.semester=t.semester
 where o.id=p_offering_id and o.status='available' and c.verification_status='verified';
 if v_term is null then raise exception 'Offering unavailable';end if;
 if not exists(select 1 from public.schedule_venues where id=p_venue_id and active) then raise exception 'Select an active venue';end if;
 if v_code like 'NSTP%' then
  if p_pattern<>'NSTP' or p_pathfit_day is not null then raise exception 'NSTP is Friday, 3 continuous hours';end if;v_duration:=180;
 elsif v_code like 'PATHFIT%' then
  if p_pattern<>'PATHFIT' or p_pathfit_day not between 1 and 5 then raise exception 'PATHFit requires one weekday';end if;v_duration:=120;
 elsif v_units=3 then
  if p_pattern not in ('MW','TTH') or p_pathfit_day is not null then raise exception 'Three-unit courses use MW or TTh';end if;v_duration:=90;
 else raise exception 'Special course contact-hour rules must be configured by administrator';end if;
 if p_start_minute<450 or p_start_minute+v_duration>1140 or (p_start_minute<720 and p_start_minute+v_duration>780) then
  raise exception 'Time outside 7:30 AM–7 PM or crossing the midday break';end if;
 if v_duration=90 and p_start_minute not in (450,540,630,780,870,960,1050) then raise exception 'Choose a standard 90-minute time';end if;
 if exists(select 1 from public.faculty_course_requests where course_offering_id=p_offering_id and status='approved') then raise exception 'Offering already allocated';end if;
 insert into public.faculty_course_requests
 (academic_term_id,course_offering_id,faculty_id,preference_rank,motivation,preferred_pattern,preferred_start_minute,preferred_pathfit_weekday,preferred_venue_id)
 values(v_term,p_offering_id,v_uid,p_rank,nullif(trim(p_motivation),''),p_pattern,p_start_minute,p_pathfit_day,p_venue_id)
 returning id into v_request_id;
 return v_request_id;
end;$function$
;
revoke all on function public.request_course_with_schedule(bigint,integer,text,text,integer,bigint,integer) from public;
grant execute on function public.request_course_with_schedule(bigint,integer,text,text,integer,bigint,integer) to authenticated;
