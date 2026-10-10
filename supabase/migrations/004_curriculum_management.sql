-- Curriculum catalog schema. Applied to AIS Supabase project on 2026-10-10.
create table if not exists public.curricula (
 id text primary key, program text not null check(program in ('BEEd','BSE')), track text,
 title text not null,effective_year text not null,source_file text not null,
 status text not null default 'active' check(status in ('active','archived')),
 created_at timestamptz not null default now()
);
create table if not exists public.curriculum_courses (
 id bigint generated always as identity primary key,
 curriculum_id text not null references public.curricula(id) on delete cascade,
 year_level int not null check(year_level between 1 and 4),
 semester int not null check(semester in (1,2)),
 course_code text not null,course_title text not null,
 units numeric(5,2) check(units>=0),prerequisite_text text,
 source_row int not null,
 verification_status text not null default 'verified' check(verification_status in ('verified','review_units','review_details')),
 created_at timestamptz not null default now(),
 unique(curriculum_id,year_level,semester,course_code)
);
create table if not exists public.academic_terms (
 id bigint generated always as identity primary key,
 academic_year text not null,semester int not null check(semester in (1,2)),
 is_active boolean not null default false,unique(academic_year,semester)
);
create unique index if not exists one_active_academic_term on public.academic_terms(is_active) where is_active=true;
create table if not exists public.class_sections (
 id text primary key,program text not null check(program in ('BEEd','BSE')),
 year_level int not null check(year_level between 1 and 4),track text,
 block_label text not null,curriculum_id text not null references public.curricula(id),
 academic_year text not null,active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.course_offerings (
 id bigint generated always as identity primary key,
 academic_term_id bigint not null references public.academic_terms(id),
 class_section_id text not null references public.class_sections(id),
 curriculum_course_id bigint not null references public.curriculum_courses(id),
 status text not null default 'available' check(status in ('available','suspended','archived')),
 unique(academic_term_id,class_section_id,curriculum_course_id)
);
alter table public.curricula enable row level security;
alter table public.curriculum_courses enable row level security;
alter table public.academic_terms enable row level security;
alter table public.class_sections enable row level security;
alter table public.course_offerings enable row level security;
grant select on public.curricula,public.curriculum_courses,public.academic_terms,public.class_sections,public.course_offerings to authenticated;
create policy "Authenticated read curricula" on public.curricula for select to authenticated using(true);
create policy "Authenticated read courses" on public.curriculum_courses for select to authenticated using(true);
create policy "Authenticated read terms" on public.academic_terms for select to authenticated using(true);
create policy "Authenticated read class sections" on public.class_sections for select to authenticated using(true);
create policy "Authenticated read offerings" on public.course_offerings for select to authenticated using(true);
grant usage,select on all sequences in schema public to authenticated;
create table if not exists public.curriculum_change_log (
 id bigint generated always as identity primary key,
 course_id bigint not null references public.curriculum_courses(id),
 admin_id uuid not null references auth.users(id),
 field_name text not null,old_value text,new_value text,
 reason text not null,changed_at timestamptz not null default now()
);
alter table public.curriculum_change_log enable row level security;
grant select on public.curriculum_change_log to authenticated;
create policy "Admins read curriculum changes" on public.curriculum_change_log for select to authenticated using(public.is_admin());
create or replace function public.admin_confirm_course_units(p_course_id bigint,p_units numeric,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare old_units numeric;old_status text;
begin
 if not public.is_admin() then raise exception 'Administrator required';end if;
 if p_units is null or p_units<=0 or p_units>12 then raise exception 'Units must be between 0 and 12';end if;
 if length(trim(coalesce(p_reason,'')))<8 then raise exception 'Provide at least 8 characters of justification';end if;
 select units,verification_status into old_units,old_status from public.curriculum_courses where id=p_course_id for update;
 if not found then raise exception 'Course not found';end if;
 update public.curriculum_courses set units=p_units,verification_status=case when old_status='review_units' then 'verified' else old_status end where id=p_course_id;
 insert into public.curriculum_change_log(course_id,admin_id,field_name,old_value,new_value,reason)
 values(p_course_id,auth.uid(),'units',old_units::text,p_units::text,p_reason);
 update public.course_offerings set status='available' where curriculum_course_id=p_course_id and status='suspended' and old_status='review_units';
end; $$;
revoke all on function public.admin_confirm_course_units(bigint,numeric,text) from public;
grant execute on function public.admin_confirm_course_units(bigint,numeric,text) to authenticated;
