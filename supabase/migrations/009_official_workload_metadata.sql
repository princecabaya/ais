-- Phase 2F: approved PSU-ACA-031 faculty workload details and classifications.
create table public.faculty_workload_details(
 faculty_id uuid not null references public.profiles(id),
 academic_term_id bigint not null references public.academic_terms(id),
 years_at_psu text, academic_rank text, govt_service_years text,
 bachelors_degree text, masters_degree text, doctoral_degree text, designation text,
 consultation_schedule text, research_details text, extension_details text,
 production_details text, cocurricular_details text, administrative_details text,
 research_hours numeric(6,2),extension_hours numeric(6,2),production_hours numeric(6,2),
 cocurricular_hours numeric(6,2),administrative_hours numeric(6,2),
 amended_by uuid references public.profiles(id),amended_at timestamptz not null default now(),
 primary key(faculty_id,academic_term_id),
 check(research_hours is null or research_hours>=0),
 check(extension_hours is null or extension_hours>=0),
 check(production_hours is null or production_hours>=0),
 check(cocurricular_hours is null or cocurricular_hours>=0),
 check(administrative_hours is null or administrative_hours>=0)
);
create table public.faculty_workload_courses(
 course_offering_id bigint primary key references public.course_offerings(id),
 faculty_id uuid not null references public.profiles(id),
 academic_term_id bigint not null references public.academic_terms(id),
 load_category text not null check(load_category in ('regular','extra')),
 units_override text,whe numeric(6,2),lec_hours numeric(6,2),
 lab_hours numeric(6,2),rle_hours numeric(6,2),male_students int,female_students int,
 justification text not null,edited_by uuid not null references public.profiles(id),
 edited_at timestamptz not null default now(),
 check(male_students is null or male_students>=0),
 check(female_students is null or female_students>=0)
);
alter table public.faculty_workload_details enable row level security;
alter table public.faculty_workload_courses enable row level security;
grant select on public.faculty_workload_details,public.faculty_workload_courses to authenticated;
create policy "Faculty read their workload profile or admin" on public.faculty_workload_details
 for select to authenticated using(faculty_id=(select auth.uid()) or (select public.is_admin()));
create policy "Faculty read their workload courses or admin" on public.faculty_workload_courses
 for select to authenticated using(faculty_id=(select auth.uid()) or (select public.is_admin()));

CREATE OR REPLACE FUNCTION public.admin_save_workload_course(p_offering_id bigint, p_category text, p_units_override text, p_whe numeric, p_lec numeric, p_lab numeric, p_rle numeric, p_male integer, p_female integer, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_faculty uuid;v_term bigint;
begin
 if not public.is_admin() then raise exception 'Administrator only';end if;
 if length(trim(coalesce(p_reason,'')))<10 then raise exception 'Provide an approval explanation (10+ characters)';end if;
 if p_category not in ('regular','extra') then raise exception 'Select regular or extra load';end if;
 if p_whe is not null and (p_whe<0 or p_whe>80) then raise exception 'WHE must be between 0 and 80';end if;
 if (p_lec is not null and p_lec<0) or (p_lab is not null and p_lab<0) or (p_rle is not null and p_rle<0) then raise exception 'Contact hours cannot be negative';end if;
 if (p_male is not null and p_male<0) or (p_female is not null and p_female<0) then raise exception 'Student counts cannot be negative';end if;
 select r.faculty_id,r.academic_term_id into v_faculty,v_term
 from public.faculty_course_requests r
 join public.schedule_proposals p on p.course_offering_id=r.course_offering_id and p.faculty_id=r.faculty_id and p.status='approved'
 where r.course_offering_id=p_offering_id and r.status='approved';
 if v_faculty is null then raise exception 'Approved course and schedule are required before workload classification';end if;
 insert into public.faculty_workload_courses
 (course_offering_id,faculty_id,academic_term_id,load_category,units_override,whe,lec_hours,lab_hours,rle_hours,male_students,female_students,justification,edited_by)
 values(p_offering_id,v_faculty,v_term,p_category,nullif(trim(p_units_override),''),p_whe,p_lec,p_lab,p_rle,p_male,p_female,trim(p_reason),auth.uid())
 on conflict(course_offering_id) do update set faculty_id=excluded.faculty_id,academic_term_id=excluded.academic_term_id,
 load_category=excluded.load_category,units_override=excluded.units_override,whe=excluded.whe,lec_hours=excluded.lec_hours,
 lab_hours=excluded.lab_hours,rle_hours=excluded.rle_hours,male_students=excluded.male_students,
 female_students=excluded.female_students,justification=excluded.justification,edited_by=auth.uid(),edited_at=now();
end;$function$
;

CREATE OR REPLACE FUNCTION public.admin_save_workload_details(p_faculty_id uuid, p_details jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_term bigint;
begin
 if not public.is_admin() then raise exception 'Administrator only';end if;
 if not exists(select 1 from public.profiles where id=p_faculty_id and status='active') then raise exception 'Active faculty member required';end if;
 if jsonb_typeof(p_details)<>'object' then raise exception 'Invalid workload details';end if;
 select id into v_term from public.academic_terms where is_active=true;
 if v_term is null then raise exception 'No active term';end if;
 insert into public.faculty_workload_details
 (faculty_id,academic_term_id,years_at_psu,academic_rank,govt_service_years,bachelors_degree,masters_degree,doctoral_degree,designation,consultation_schedule,research_details,extension_details,production_details,cocurricular_details,administrative_details,research_hours,extension_hours,production_hours,cocurricular_hours,administrative_hours,amended_by)
 values
 (p_faculty_id,v_term,p_details->>'years_at_psu',p_details->>'academic_rank',p_details->>'govt_service_years',p_details->>'bachelors_degree',p_details->>'masters_degree',p_details->>'doctoral_degree',p_details->>'designation',p_details->>'consultation_schedule',p_details->>'research_details',p_details->>'extension_details',p_details->>'production_details',p_details->>'cocurricular_details',p_details->>'administrative_details',
 nullif(p_details->>'research_hours','')::numeric,nullif(p_details->>'extension_hours','')::numeric,nullif(p_details->>'production_hours','')::numeric,nullif(p_details->>'cocurricular_hours','')::numeric,nullif(p_details->>'administrative_hours','')::numeric,auth.uid())
 on conflict(faculty_id,academic_term_id) do update set
 years_at_psu=excluded.years_at_psu,academic_rank=excluded.academic_rank,govt_service_years=excluded.govt_service_years,
 bachelors_degree=excluded.bachelors_degree,masters_degree=excluded.masters_degree,doctoral_degree=excluded.doctoral_degree,
 designation=excluded.designation,consultation_schedule=excluded.consultation_schedule,
 research_details=excluded.research_details,extension_details=excluded.extension_details,production_details=excluded.production_details,
 cocurricular_details=excluded.cocurricular_details,administrative_details=excluded.administrative_details,
 research_hours=excluded.research_hours,extension_hours=excluded.extension_hours,production_hours=excluded.production_hours,
 cocurricular_hours=excluded.cocurricular_hours,administrative_hours=excluded.administrative_hours,
 amended_by=auth.uid(),amended_at=now();
end;$function$
;

revoke all on function public.admin_save_workload_course(bigint,text,text,numeric,numeric,numeric,numeric,int,int,text) from public;
revoke all on function public.admin_save_workload_details(uuid,jsonb) from public;
grant execute on function public.admin_save_workload_course(bigint,text,text,numeric,numeric,numeric,numeric,int,int,text) to authenticated;
grant execute on function public.admin_save_workload_details(uuid,jsonb) to authenticated;
