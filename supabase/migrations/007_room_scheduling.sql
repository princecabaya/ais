-- Phase 2D. AIS room / scheduling tables and RPCs (applied to production).
create table public.schedule_venues(
 id bigint generated always as identity primary key,
 name text not null unique check(length(trim(name)) between 2 and 100),
 venue_type text not null default 'room' check(venue_type in ('room','gym','field','hall','offsite','other')),
 active boolean not null default true,created_by uuid references public.profiles(id),
 created_at timestamptz not null default now()
);
insert into public.schedule_venues(name,venue_type) select 'Room '||n,'room' from generate_series(1,7) n;
create table public.schedule_proposals(
 id bigint generated always as identity primary key,
 course_request_id bigint not null references public.faculty_course_requests(id),
 academic_term_id bigint not null references public.academic_terms(id),
 faculty_id uuid not null references public.profiles(id),
 course_offering_id bigint not null references public.course_offerings(id),
 venue_id bigint not null references public.schedule_venues(id),
 meeting_pattern text not null check(meeting_pattern in ('MW','TTH','PATHFIT','NSTP')),
 start_minute integer not null,duration_minutes integer not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected','withdrawn')),
 submitted_at timestamptz not null default now(),decided_at timestamptz,
 decided_by uuid references public.profiles(id),decision_note text,
 pathfit_weekday smallint check(pathfit_weekday between 1 and 5),
 check((status in ('approved','rejected'))=(decided_by is not null)),
 check(start_minute>=450 and start_minute+duration_minutes<=1140),
 check((meeting_pattern in ('MW','TTH') and duration_minutes=90) or (meeting_pattern='PATHFIT' and duration_minutes=120) or (meeting_pattern='NSTP' and duration_minutes=180)),
 constraint pathfit_day_consistency check((meeting_pattern='PATHFIT')=(pathfit_weekday is not null)),
 constraint no_lunch_crossing check(not(start_minute<720 and start_minute+duration_minutes>780))
);
create unique index schedule_one_approved_per_offering on public.schedule_proposals(course_offering_id) where status='approved';
create index schedule_proposals_term_status on public.schedule_proposals(academic_term_id,status);
create table public.schedule_meetings(
 id bigint generated always as identity primary key,
 proposal_id bigint not null references public.schedule_proposals(id) on delete cascade,
 academic_term_id bigint not null references public.academic_terms(id),
 faculty_id uuid not null references public.profiles(id),
 course_offering_id bigint not null references public.course_offerings(id),
 class_section_id text not null references public.class_sections(id),
 venue_id bigint not null references public.schedule_venues(id),
 weekday smallint not null check(weekday between 1 and 5),
 start_minute integer not null,end_minute integer not null,
 active boolean not null default true,check(end_minute>start_minute)
);
create index schedule_meetings_term_day on public.schedule_meetings(academic_term_id,weekday,start_minute,end_minute) where active;
create unique index schedule_meetings_proposal_day on public.schedule_meetings(proposal_id,weekday) where active;
alter table public.schedule_venues enable row level security;
alter table public.schedule_proposals enable row level security;
alter table public.schedule_meetings enable row level security;
grant select on public.schedule_venues,public.schedule_proposals,public.schedule_meetings to authenticated;
create policy "Read venues" on public.schedule_venues for select to authenticated using(true);
create policy "Read own proposals or admin" on public.schedule_proposals for select to authenticated using(faculty_id=(select auth.uid()) or (select public.is_admin()));
create policy "Read published sessions" on public.schedule_meetings for select to authenticated using(true);

CREATE OR REPLACE FUNCTION public.admin_add_venue(p_name text, p_type text DEFAULT 'room'::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id bigint;
begin
 if not public.is_admin() then raise exception 'Administrator only';end if;
 if p_type not in ('room','gym','field','hall','offsite','other') then raise exception 'Invalid venue type';end if;
 if length(trim(coalesce(p_name,''))) not between 2 and 100 then raise exception 'Venue name must be 2–100 characters';end if;
 insert into public.schedule_venues(name,venue_type,created_by) values(trim(p_name),p_type,auth.uid()) returning id into v_id;
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
  if not exists(select 1 from public.schedule_venues where id=v.venue_id and active) then raise exception 'Venue is inactive';end if;
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

CREATE OR REPLACE FUNCTION public.submit_schedule_proposal(p_course_request_id bigint, p_venue_id bigint, p_pattern text, p_start_minute integer, p_pathfit_day integer DEFAULT NULL::integer)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_request public.faculty_course_requests%rowtype;
v_code text;v_units numeric;v_term bigint;v_duration integer;v_id bigint;v_day smallint;
begin
 select * into v_request from public.faculty_course_requests where id=p_course_request_id;
 if not found or v_request.faculty_id<>auth.uid() or v_request.status<>'approved' then
  raise exception 'Only approved course assignments can be scheduled by their assigned instructor';end if;
 select id into v_term from public.academic_terms where is_active=true;
 if v_term is null or v_term<>v_request.academic_term_id then raise exception 'Request does not belong to active semester';end if;
 if not exists(select 1 from public.schedule_venues where id=p_venue_id and active) then raise exception 'Venue not available';end if;
 select upper(regexp_replace(trim(c.course_code),'[[:space:]]+','','g')),c.units into v_code,v_units
 from public.course_offerings o join public.curriculum_courses c on c.id=o.curriculum_course_id
 where o.id=v_request.course_offering_id and o.status='available' and c.verification_status='verified';
 if v_code is null then raise exception 'Course is not verified and available';end if;
 if v_code like 'NSTP%' then
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

CREATE OR REPLACE FUNCTION public.withdraw_schedule_proposal(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 update public.schedule_proposals set status='withdrawn' where id=p_id and faculty_id=auth.uid() and status='pending';
 if not found then raise exception 'You may withdraw only your pending schedule proposals';end if;
end;$function$
;

revoke all on function public.admin_add_venue(text,text) from public;
revoke all on function public.submit_schedule_proposal(bigint,bigint,text,integer,integer) from public;
revoke all on function public.withdraw_schedule_proposal(bigint) from public;
revoke all on function public.decide_schedule_proposal(bigint,boolean,text) from public;
grant execute on function public.admin_add_venue(text,text) to authenticated;
grant execute on function public.submit_schedule_proposal(bigint,bigint,text,integer,integer) to authenticated;
grant execute on function public.withdraw_schedule_proposal(bigint) to authenticated;
grant execute on function public.decide_schedule_proposal(bigint,boolean,text) to authenticated;
