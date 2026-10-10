-- Allow explicitly room-free Field Study, Internship and Practicum placements.
alter table public.faculty_course_requests drop constraint if exists faculty_course_requests_preferred_pattern_check;
alter table public.faculty_course_requests add constraint faculty_course_requests_preferred_pattern_check check(preferred_pattern in ('MW','TTH','PATHFIT','NSTP','FIELD'));
alter table public.faculty_course_requests drop constraint if exists preference_schedule_complete;
alter table public.faculty_course_requests add constraint preference_schedule_complete check(
(preferred_pattern is null and preferred_start_minute is null and preferred_pathfit_weekday is null and preferred_venue_id is null)
or (preferred_pattern='FIELD' and preferred_start_minute=450 and preferred_pathfit_weekday is null and preferred_venue_id is null)
or (preferred_pattern in ('MW','TTH','PATHFIT','NSTP') and preferred_start_minute is not null and preferred_venue_id is not null and ((preferred_pattern='PATHFIT')=(preferred_pathfit_weekday is not null)))
);
alter table public.schedule_proposals alter column venue_id drop not null;
alter table public.schedule_proposals drop constraint schedule_proposals_meeting_pattern_check;
alter table public.schedule_proposals add constraint schedule_proposals_meeting_pattern_check check(meeting_pattern in ('MW','TTH','PATHFIT','NSTP','FIELD'));
alter table public.schedule_proposals drop constraint schedule_proposals_check2;
alter table public.schedule_proposals add constraint schedule_proposals_check2 check(
(meeting_pattern in ('MW','TTH') and duration_minutes=90)
or (meeting_pattern='PATHFIT' and duration_minutes=120)
or (meeting_pattern='NSTP' and duration_minutes=180)
or (meeting_pattern='FIELD' and duration_minutes=0 and venue_id is null and start_minute=450)
);
alter table public.schedule_meetings alter column venue_id drop not null;
CREATE OR REPLACE FUNCTION public.request_course_with_schedule(p_offering_id bigint, p_rank integer, p_motivation text, p_pattern text, p_start_minute integer, p_venue_id bigint, p_pathfit_day integer DEFAULT NULL::integer)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid();v_term bigint;v_request_id bigint;v_code text;v_title text;v_units numeric;v_duration integer;
begin
 if not exists(select 1 from public.profiles where id=v_uid and status='active') then raise exception 'Active faculty account required';end if;
 if p_rank not between 1 and 10 then raise exception 'Rank must be 1–10';end if;
 if length(coalesce(p_motivation,''))>1000 then raise exception 'Reason too long';end if;
 select o.academic_term_id,upper(regexp_replace(c.course_code,'[[:space:]]+','','g')),upper(c.course_title),c.units
 into v_term,v_code,v_title,v_units
 from public.course_offerings o
 join public.academic_terms t on t.id=o.academic_term_id and t.is_active=true
 join public.class_sections s on s.id=o.class_section_id and s.active=true and s.academic_year=t.academic_year
 join public.curriculum_courses c on c.id=o.curriculum_course_id and c.curriculum_id=s.curriculum_id and c.year_level=s.year_level and c.semester=t.semester
 where o.id=p_offering_id and o.status='available' and c.verification_status='verified';
 if v_term is null then raise exception 'Offering unavailable';end if;
 if p_pattern='FIELD' then
  if v_title not like '%FIELD STUDY%' and v_title not like '%INTERNSHIP%' and v_title not like '%PRACTICUM%' then raise exception 'No-room placement is allowed only for Field Study, Internship, or Practicum';end if;
  if p_venue_id is not null or p_pathfit_day is not null or p_start_minute<>450 then raise exception 'No-room placement cannot reserve a timetable slot';end if;
  v_duration:=0;
 elsif not exists(select 1 from public.schedule_venues where id=p_venue_id and active) then raise exception 'Select an active venue';end if;
 if p_pattern='FIELD' then null;
 elsif v_code like 'NSTP%' then
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
  if v_request.preferred_pattern is not null and v_request.preferred_pattern<>'FIELD' then
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
  v_duration:=case v_request.preferred_pattern when 'FIELD' then 0 when 'NSTP' then 180 when 'PATHFIT' then 120 else 90 end;
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

CREATE OR REPLACE FUNCTION public.submit_schedule_proposal(p_course_request_id bigint, p_venue_id bigint, p_pattern text, p_start_minute integer, p_pathfit_day integer DEFAULT NULL::integer)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_request public.faculty_course_requests%rowtype;
v_code text;v_title text;v_units numeric;v_term bigint;v_duration integer;v_id bigint;v_day smallint;
begin
 select * into v_request from public.faculty_course_requests where id=p_course_request_id;
 if not found or v_request.faculty_id<>auth.uid() or v_request.status<>'approved' then
  raise exception 'Only approved course assignments can be scheduled by their assigned instructor';end if;
 select id into v_term from public.academic_terms where is_active=true;
 if v_term is null or v_term<>v_request.academic_term_id then raise exception 'Request does not belong to active semester';end if;
 if p_pattern<>'FIELD' and not exists(select 1 from public.schedule_venues where id=p_venue_id and active) then raise exception 'Venue not available';end if;
 select upper(regexp_replace(trim(c.course_code),'[[:space:]]+','','g')),upper(c.course_title),c.units into v_code,v_title,v_units
 from public.course_offerings o join public.curriculum_courses c on c.id=o.curriculum_course_id
 where o.id=v_request.course_offering_id and o.status='available' and c.verification_status='verified';
 if v_code is null then raise exception 'Course is not verified and available';end if;
 if p_pattern='FIELD' then
  if (v_title not like '%FIELD STUDY%' and v_title not like '%INTERNSHIP%' and v_title not like '%PRACTICUM%') or p_venue_id is not null or p_start_minute<>450 or p_pathfit_day is not null then raise exception 'Invalid room-free field placement';end if;
  v_duration:=0;
 elsif v_code like 'NSTP%' then
  if p_pattern<>'NSTP' then raise exception 'NSTP must be a single 3-hour Friday session';end if;
  v_duration:=180;
 elsif v_code like 'PATHFIT%' then
  if p_pattern<>'PATHFIT' or p_pathfit_day not between 1 and 5 then raise exception 'PATHFit requires a weekday and one uninterrupted 2-hour session';end if;
  v_duration:=120;v_day:=p_pathfit_day::smallint;
 elsif v_units=3 then
  if p_pattern not in ('MW','TTH') then raise exception 'Three-unit courses require MW or Tuesday/Thursday sessions';end if;
  v_duration:=90;
 else
  raise exception 'Special course requires administrator-defined meeting rules before scheduling';
 end if;
 if p_start_minute<450 or p_start_minute+v_duration>1140 then raise exception 'Meeting must fit between 7:30 AM and 7:00 PM';end if;
 if p_start_minute<720 and p_start_minute+v_duration>780 then raise exception 'Continuous classes may not cross the 12:00–1:00 PM break';end if;
 if v_duration=90 and p_start_minute not in (450,540,630,780,870,960,1050) then raise exception 'MW/TTh session must use a standard 90-minute period';end if;
 if exists(select 1 from public.schedule_proposals where course_offering_id=v_request.course_offering_id and status='approved') then raise exception 'This course is already scheduled';end if;
 if exists(select 1 from public.schedule_proposals where course_request_id=p_course_request_id and status='pending') then raise exception 'Withdraw the existing pending schedule proposal before creating another';end if;
 insert into public.schedule_proposals(course_request_id,academic_term_id,faculty_id,course_offering_id,venue_id,meeting_pattern,start_minute,duration_minutes,pathfit_weekday)
 values(p_course_request_id,v_term,auth.uid(),v_request.course_offering_id,p_venue_id,p_pattern,p_start_minute,v_duration,v_day) returning id into v_id;
 return v_id;
end;$function$
;

CREATE OR REPLACE FUNCTION public.decide_schedule_proposal(p_id bigint, p_approve boolean, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.schedule_proposals%rowtype;v_section text;v_days int[];v_day int;v_conflict text;
begin
 if not public.is_admin() then raise exception 'Administrator only';end if;
 if length(trim(coalesce(p_reason,'')))<10 then raise exception 'Provide a justification with at least 10 characters';end if;
 select * into v from public.schedule_proposals where id=p_id for update;
 if not found or v.status<>'pending' then raise exception 'Pending proposal not found';end if;
 perform pg_advisory_xact_lock(v.academic_term_id);
 if p_approve then
  if not exists(select 1 from public.faculty_course_requests where id=v.course_request_id
    and faculty_id=v.faculty_id and course_offering_id=v.course_offering_id and status='approved') then
    raise exception 'Approved course allocation is required';
  end if;
  if v.meeting_pattern<>'FIELD' and not exists(select 1 from public.schedule_venues where id=v.venue_id and active) then raise exception 'Venue is inactive';end if;
  select class_section_id into v_section from public.course_offerings where id=v.course_offering_id and status='available';
  if v_section is null then raise exception 'Course offering is no longer available';end if;
  if not exists(select 1 from public.academic_terms where id=v.academic_term_id and is_active) then raise exception 'Academic term not active';end if;
  if exists(select 1 from public.schedule_proposals where course_offering_id=v.course_offering_id and status='approved') then raise exception 'Already scheduled';end if;
  v_days:=case v.meeting_pattern when 'MW' then array[1,3] when 'TTH' then array[2,4] when 'NSTP' then array[5] else array[]::int[] end;
  if v.meeting_pattern='PATHFIT' then
    -- PATHFIT weekday is kept in a dedicated proposal field after schema extension below.
    select array[pathfit_weekday] into v_days from public.schedule_proposals where id=v.id;
  end if;
  foreach v_day in array v_days loop
    if exists(select 1 from public.schedule_meetings m where m.active and m.academic_term_id=v.academic_term_id
      and m.weekday=v_day and m.start_minute<v.start_minute+v.duration_minutes and m.end_minute>v.start_minute
      and (m.faculty_id=v.faculty_id or m.venue_id=v.venue_id or m.class_section_id=v_section))
    then raise exception 'Schedule conflict on day %: faculty, venue, or student block is already occupied',v_day;end if;
    if exists(
       select 1 from public.faculty_availability a where a.faculty_id=v.faculty_id and a.academic_term_id=v.academic_term_id
       and a.weekday=v_day and a.preference='unavailable'
       and (case a.slot_index when 1 then 450 when 2 then 540 when 3 then 630 when 4 then 780 when 5 then 870 when 6 then 960 else 1050 end)<v.start_minute+v.duration_minutes
       and (case a.slot_index when 1 then 540 when 2 then 630 when 3 then 720 when 4 then 870 when 5 then 960 when 6 then 1050 else 1140 end)>v.start_minute
       and not exists(select 1 from public.availability_overrides x where x.faculty_id=v.faculty_id and x.academic_term_id=v.academic_term_id and x.weekday=v_day and x.slot_index=a.slot_index and x.revoked_at is null)
    ) then raise exception 'Instructor marked part of the proposed meeting as unavailable; record an authorized availability exception first';end if;
  end loop;
  foreach v_day in array v_days loop
    insert into public.schedule_meetings(proposal_id,academic_term_id,faculty_id,course_offering_id,class_section_id,venue_id,weekday,start_minute,end_minute)
    values(v.id,v.academic_term_id,v.faculty_id,v.course_offering_id,v_section,v.venue_id,v_day,v.start_minute,v.start_minute+v.duration_minutes);
  end loop;
 end if;
 update public.schedule_proposals set status=case when p_approve then 'approved' else 'rejected' end,
 decided_by=auth.uid(),decided_at=now(),decision_note=trim(p_reason) where id=v.id;
 insert into public.faculty_notifications(recipient_id,title,body)
 values(v.faculty_id,case when p_approve then 'Schedule approved' else 'Schedule declined' end,
 trim(p_reason));
end;$function$
;

CREATE OR REPLACE FUNCTION public.admin_move_published_schedule(p_proposal_id bigint, p_venue_id bigint, p_pattern text, p_start_minute integer, p_pathfit_weekday integer, p_justification text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.schedule_proposals%rowtype; v_code text;v_units numeric;v_duration integer;
v_section text;v_days integer[];v_day integer;v_old jsonb;v_title text;
begin
 if not public.is_admin() then raise exception 'Administrator only';end if;
 if length(trim(coalesce(p_justification,'')))<10 then raise exception 'A documented reason of at least ten characters is required';end if;
 select * into v from public.schedule_proposals where id=p_proposal_id for update;
 if not found or v.status<>'approved' then raise exception 'Only approved schedules can be changed';end if;
 perform pg_advisory_xact_lock(v.academic_term_id);
 if not exists(select 1 from public.academic_terms where id=v.academic_term_id and is_active) then raise exception 'The term is not active';end if;
 if p_pattern<>'FIELD' and not exists(select 1 from public.schedule_venues where id=p_venue_id and active) then raise exception 'Venue unavailable';end if;
 select upper(regexp_replace(c.course_code,'[[:space:]]+','','g')),c.units,o.class_section_id,upper(c.course_title)
 into v_code,v_units,v_section,v_title
 from public.course_offerings o join public.curriculum_courses c on c.id=o.curriculum_course_id
 where o.id=v.course_offering_id and o.status='available' and c.verification_status='verified';
 if v_code is null then raise exception 'Offering unavailable';end if;
 if p_pattern='FIELD' then
  if (v_title not like '%FIELD STUDY%' and v_title not like '%INTERNSHIP%' and v_title not like '%PRACTICUM%') or p_venue_id is not null or p_start_minute<>450 or p_pathfit_weekday is not null then raise exception 'Invalid room-free placement';end if;
  v_duration:=0;v_days:=array[]::integer[];
 elsif v_code like 'NSTP%' then
  if p_pattern<>'NSTP' or p_pathfit_weekday is not null then raise exception 'NSTP meets on Friday';end if;
  v_duration:=180;v_days:=array[5];
 elsif v_code like 'PATHFIT%' then
  if p_pattern<>'PATHFIT' or p_pathfit_weekday not between 1 and 5 then raise exception 'PATHFit requires a weekday';end if;
  v_duration:=120;v_days:=array[p_pathfit_weekday];
 elsif v_units=3 then
  if p_pattern='MW' then v_days:=array[1,3];
  elsif p_pattern='TTH' then v_days:=array[2,4];
  else raise exception '3-unit courses require MW or TTh';end if;
  if p_pathfit_weekday is not null then raise exception 'Unexpected PATHFit weekday';end if;
  v_duration:=90;
 else raise exception 'Meeting rules not configured for this course';end if;
 if p_start_minute<450 or p_start_minute+v_duration>1140 then raise exception 'Meeting outside daily hours';end if;
 if p_start_minute<720 and p_start_minute+v_duration>780 then raise exception 'Meeting crosses lunch break';end if;
 if v_duration=90 and p_start_minute not in (450,540,630,780,870,960,1050) then raise exception 'Nonstandard 90-minute start';end if;
 foreach v_day in array v_days loop
  if exists(select 1 from public.schedule_meetings m where m.active and m.proposal_id<>v.id
   and m.academic_term_id=v.academic_term_id and m.weekday=v_day
   and m.start_minute<p_start_minute+v_duration and m.end_minute>p_start_minute
   and (m.faculty_id=v.faculty_id or m.venue_id=p_venue_id or m.class_section_id=v_section))
   then raise exception 'Schedule conflict on weekday %',v_day;end if;
  if exists(select 1 from public.faculty_availability a where a.faculty_id=v.faculty_id
   and a.academic_term_id=v.academic_term_id and a.weekday=v_day and a.preference='unavailable'
   and (case a.slot_index when 1 then 450 when 2 then 540 when 3 then 630 when 4 then 780 when 5 then 870 when 6 then 960 else 1050 end)<p_start_minute+v_duration
   and (case a.slot_index when 1 then 540 when 2 then 630 when 3 then 720 when 4 then 870 when 5 then 960 when 6 then 1050 else 1140 end)>p_start_minute
   and not exists(select 1 from public.availability_overrides x where x.faculty_id=v.faculty_id and x.academic_term_id=v.academic_term_id and x.weekday=v_day and x.slot_index=a.slot_index and x.revoked_at is null))
   then raise exception 'Instructor unavailable on weekday %, administrator exception required',v_day;end if;
 end loop;
 v_old:=jsonb_build_object('venue_id',v.venue_id,'pattern',v.meeting_pattern,'start_minute',v.start_minute,'pathfit_weekday',v.pathfit_weekday);
 update public.schedule_meetings set active=false where proposal_id=v.id and active;
 update public.schedule_proposals set venue_id=p_venue_id,meeting_pattern=p_pattern,start_minute=p_start_minute,
 duration_minutes=v_duration,pathfit_weekday=case when p_pattern='PATHFIT' then p_pathfit_weekday else null end,
 decided_by=auth.uid(),decided_at=now(),decision_note=trim(p_justification) where id=v.id;
 foreach v_day in array v_days loop
 insert into public.schedule_meetings(proposal_id,academic_term_id,faculty_id,course_offering_id,class_section_id,venue_id,weekday,start_minute,end_minute)
 values(v.id,v.academic_term_id,v.faculty_id,v.course_offering_id,v_section,p_venue_id,v_day,p_start_minute,p_start_minute+v_duration);
 end loop;
 insert into public.schedule_admin_audit(academic_term_id,proposal_id,admin_id,action,justification,details)
 values(v.academic_term_id,v.id,auth.uid(),'reschedule',trim(p_justification),
 jsonb_build_object('before',v_old,'after',jsonb_build_object('venue_id',p_venue_id,'pattern',p_pattern,'start_minute',p_start_minute,'pathfit_weekday',p_pathfit_weekday)));
 insert into public.faculty_notifications(recipient_id,title,body)
 values(v.faculty_id,'Approved schedule changed',format('An administrator updated your approved meeting. Reason: %s',trim(p_justification)));
 -- A revised schedule requires a new publication event.
 delete from public.schedule_publications where academic_term_id=v.academic_term_id;
end;$function$
;
