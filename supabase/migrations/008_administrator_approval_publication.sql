-- Administrator schedule revisions and formal publication (AIS production schema).
-- This migration represents the structure already applied to Supabase.
create table public.schedule_publications (
 academic_term_id bigint primary key references public.academic_terms(id),
 published_at timestamptz not null default now(),
 published_by uuid not null references public.profiles(id),
 publication_note text not null,
 revision integer not null default 1
);
create table public.schedule_admin_audit (
 id bigint generated always as identity primary key,
 academic_term_id bigint not null references public.academic_terms(id),
 proposal_id bigint references public.schedule_proposals(id),
 admin_id uuid not null references public.profiles(id),
 action text not null,
 justification text not null,
 details jsonb not null default '{}'::jsonb,
 recorded_at timestamptz not null default now()
);
alter table public.schedule_publications enable row level security;
alter table public.schedule_admin_audit enable row level security;
grant select on public.schedule_publications,public.schedule_admin_audit to authenticated;
create policy "Authenticated can see publication status" on public.schedule_publications
 for select to authenticated using(true);
create policy "Admin can see audit trail" on public.schedule_admin_audit
 for select to authenticated using ((select public.is_admin()));
drop policy if exists "Read published sessions" on public.schedule_meetings;
create policy "Published timetable or administrator preview" on public.schedule_meetings
 for select to authenticated using ((select public.is_admin()) or exists(
 select 1 from public.schedule_publications pub where pub.academic_term_id=schedule_meetings.academic_term_id
 ));

CREATE OR REPLACE FUNCTION public.admin_move_published_schedule(p_proposal_id bigint, p_venue_id bigint, p_pattern text, p_start_minute integer, p_pathfit_weekday integer, p_justification text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.schedule_proposals%rowtype; v_code text;v_units numeric;v_duration integer;
v_section text;v_days integer[];v_day integer;v_old jsonb;
begin
 if not public.is_admin() then raise exception 'Administrator only';end if;
 if length(trim(coalesce(p_justification,'')))<10 then raise exception 'A documented reason of at least ten characters is required';end if;
 select * into v from public.schedule_proposals where id=p_proposal_id for update;
 if not found or v.status<>'approved' then raise exception 'Only approved schedules can be changed';end if;
 perform pg_advisory_xact_lock(v.academic_term_id);
 if not exists(select 1 from public.academic_terms where id=v.academic_term_id and is_active) then raise exception 'The term is not active';end if;
 if not exists(select 1 from public.schedule_venues where id=p_venue_id and active) then raise exception 'Venue unavailable';end if;
 select upper(regexp_replace(c.course_code,'[[:space:]]+','','g')),c.units,o.class_section_id
 into v_code,v_units,v_section
 from public.course_offerings o join public.curriculum_courses c on c.id=o.curriculum_course_id
 where o.id=v.course_offering_id and o.status='available' and c.verification_status='verified';
 if v_code is null then raise exception 'Offering unavailable';end if;
 if v_code like 'NSTP%' then
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

CREATE OR REPLACE FUNCTION public.admin_publish_schedule(p_justification text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_term bigint;v_count int;
begin
 if not public.is_admin() then raise exception 'Administrator only';end if;
 if length(trim(coalesce(p_justification,'')))<10 then raise exception 'Publication note needs at least ten characters';end if;
 select id into v_term from public.academic_terms where is_active=true;
 if v_term is null then raise exception 'No active academic term';end if;
 perform pg_advisory_xact_lock(v_term);
 select count(*) into v_count from public.schedule_meetings where academic_term_id=v_term and active;
 if v_count=0 then raise exception 'Cannot publish an empty timetable';end if;
 if exists(
 select 1 from public.schedule_meetings a join public.schedule_meetings b on a.id<b.id
 and a.academic_term_id=b.academic_term_id and a.weekday=b.weekday
 and a.start_minute<b.end_minute and a.end_minute>b.start_minute
 and (a.faculty_id=b.faculty_id or a.venue_id=b.venue_id or a.class_section_id=b.class_section_id)
 where a.active and b.active and a.academic_term_id=v_term
 ) then raise exception 'Conflicting published sessions detected';end if;
 insert into public.schedule_publications(academic_term_id,published_by,publication_note)
 values(v_term,auth.uid(),trim(p_justification))
 on conflict(academic_term_id) do update
 set published_at=now(),published_by=excluded.published_by,publication_note=excluded.publication_note,revision=public.schedule_publications.revision+1;
 insert into public.schedule_admin_audit(academic_term_id,admin_id,action,justification,details)
 values(v_term,auth.uid(),'publish',trim(p_justification),jsonb_build_object('meeting_count',v_count));
end;$function$
;

CREATE OR REPLACE FUNCTION public.invalidate_schedule_publication()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_term bigint;
begin
 v_term:=case when tg_op='DELETE' then old.academic_term_id else new.academic_term_id end;
 delete from public.schedule_publications where academic_term_id=v_term;
 return case when tg_op='DELETE' then old else new end;
end;$function$
;

create trigger invalidate_publication_on_meeting_change
 after insert or update or delete on public.schedule_meetings
 for each row execute function public.invalidate_schedule_publication();
revoke all on function public.admin_move_published_schedule(bigint,bigint,text,integer,integer,text) from public;
revoke all on function public.admin_publish_schedule(text) from public;
grant execute on function public.admin_move_published_schedule(bigint,bigint,text,integer,integer,text) to authenticated;
grant execute on function public.admin_publish_schedule(text) to authenticated;
