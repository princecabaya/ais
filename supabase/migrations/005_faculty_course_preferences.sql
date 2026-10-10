-- Phase 2B: faculty course preferences and admin decisions (applied to AIS Supabase).
create table public.faculty_course_requests (
 id bigint generated always as identity primary key,
 academic_term_id bigint not null references public.academic_terms(id),
 course_offering_id bigint not null references public.course_offerings(id),
 faculty_id uuid not null references public.profiles(id),
 preference_rank integer not null check(preference_rank between 1 and 10),
 motivation text check(char_length(motivation)<=1000),
 status text not null default 'pending' check(status in ('pending','approved','rejected','withdrawn')),
 requested_at timestamptz not null default now(),
 decided_at timestamptz,
 decided_by uuid references public.profiles(id),
 decision_note text,
 constraint decision_consistency check((status in ('approved','rejected')) = (decided_by is not null))
);
create unique index one_live_request_per_faculty_offering on public.faculty_course_requests(faculty_id,course_offering_id) where status in ('pending','approved');
create unique index one_approved_instructor_per_offering on public.faculty_course_requests(course_offering_id) where status='approved';
create index faculty_course_requests_status_idx on public.faculty_course_requests(status,academic_term_id);
create table public.faculty_notifications (
 id bigint generated always as identity primary key,
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 title text not null,body text not null,
 related_request_id bigint references public.faculty_course_requests(id),
 created_at timestamptz not null default now(),read_at timestamptz
);
alter table public.faculty_course_requests enable row level security;
alter table public.faculty_notifications enable row level security;
grant select on public.faculty_course_requests,public.faculty_notifications to authenticated;
create policy "Faculty own requests and admin all" on public.faculty_course_requests
 for select to authenticated using(faculty_id=(select auth.uid()) or (select public.is_admin()));
create policy "Faculty own notifications" on public.faculty_notifications
 for select to authenticated using(recipient_id=(select auth.uid()));
create function public.request_course_preference(p_offering_id bigint,p_rank integer,p_motivation text default null)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_term bigint;v_request_id bigint;
begin
 if v_uid is null or not exists(select 1 from public.profiles where id=v_uid and status='active')
 then raise exception 'An active faculty account is required';end if;
 if p_rank not between 1 and 10 then raise exception 'Preference rank must be 1 to 10';end if;
 if length(coalesce(p_motivation,''))>1000 then raise exception 'Reason is too long';end if;
 select o.academic_term_id into v_term from public.course_offerings o
 join public.academic_terms t on t.id=o.academic_term_id and t.is_active=true
 join public.class_sections s on s.id=o.class_section_id and s.active=true and s.academic_year=t.academic_year
 join public.curriculum_courses c on c.id=o.curriculum_course_id and c.curriculum_id=s.curriculum_id and c.year_level=s.year_level and c.semester=t.semester
 where o.id=p_offering_id and o.status='available' and c.verification_status='verified';
 if v_term is null then raise exception 'This course is not currently available for selection';end if;
 if exists(select 1 from public.faculty_course_requests where course_offering_id=p_offering_id and status='approved')
 then raise exception 'This course has already been allocated';end if;
 insert into public.faculty_course_requests(academic_term_id,course_offering_id,faculty_id,preference_rank,motivation)
 values(v_term,p_offering_id,v_uid,p_rank,nullif(trim(p_motivation),''))
 returning id into v_request_id;
 return v_request_id;
end;$$;
create function public.withdraw_course_preference(p_request_id bigint)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.faculty_course_requests set status='withdrawn'
 where id=p_request_id and faculty_id=auth.uid() and status='pending';
 if not found then raise exception 'Only your pending requests can be withdrawn';end if;
end;$$;
create function public.decide_course_preference(p_request_id bigint,p_approve boolean,p_note text)
returns void language plpgsql security definer set search_path='' as $$
declare v_request public.faculty_course_requests%rowtype;v_title text;v_block text;
begin
 if not public.is_admin() then raise exception 'Administrator approval required';end if;
 if length(trim(coalesce(p_note,'')))<5 then raise exception 'Provide an administrative reason (at least 5 characters)';end if;
 select * into v_request from public.faculty_course_requests where id=p_request_id for update;
 if not found or v_request.status<>'pending' then raise exception 'Request is not pending';end if;
 if p_approve then
  perform pg_advisory_xact_lock(v_request.course_offering_id);
  if not exists(select 1 from public.course_offerings o join public.academic_terms t on t.id=o.academic_term_id and t.is_active=true where o.id=v_request.course_offering_id and o.status='available')
  then raise exception 'Offering is no longer available';end if;
  if exists(select 1 from public.faculty_course_requests where course_offering_id=v_request.course_offering_id and status='approved')
  then raise exception 'Another instructor has already been approved for this block course';end if;
 end if;
 update public.faculty_course_requests set status=case when p_approve then 'approved' else 'rejected' end,
 decided_by=auth.uid(),decided_at=now(),decision_note=trim(p_note) where id=p_request_id;
 select c.course_code,s.block_label into v_title,v_block from public.course_offerings o
 join public.curriculum_courses c on c.id=o.curriculum_course_id
 join public.class_sections s on s.id=o.class_section_id where o.id=v_request.course_offering_id;
 insert into public.faculty_notifications(recipient_id,title,body,related_request_id)
 values(v_request.faculty_id,case when p_approve then 'Course preference approved' else 'Course preference declined' end,
 format('%s — %s: %s',v_title,v_block,trim(p_note)),p_request_id);
end;$$;
revoke all on function public.request_course_preference(bigint,integer,text) from public;
revoke all on function public.withdraw_course_preference(bigint) from public;
revoke all on function public.decide_course_preference(bigint,boolean,text) from public;
grant execute on function public.request_course_preference(bigint,integer,text) to authenticated;
grant execute on function public.withdraw_course_preference(bigint) to authenticated;
grant execute on function public.decide_course_preference(bigint,boolean,text) to authenticated;
