-- Admin academic year: present academic year plus next nine; clones 11 block records on first activation.
CREATE OR REPLACE FUNCTION public.admin_activate_academic_term(p_academic_year text, p_semester integer)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id bigint;v_sections integer;v_created integer;v_start integer;
begin
 if not public.is_admin() then raise exception 'Administrator access required';end if;
 if p_semester not in (1,2) then raise exception 'Semester must be first or second';end if;
 if p_academic_year !~ '^[0-9]{4}–[0-9]{4}$' then raise exception 'Academic year must use YYYY–YYYY';end if;
 v_start:=extract(year from now() at time zone 'Asia/Manila')::integer;
 if split_part(p_academic_year,'–',1)::integer not between v_start and v_start+9
 or split_part(p_academic_year,'–',2)::integer<>split_part(p_academic_year,'–',1)::integer+1 then
 raise exception 'Select one of the present ten academic years';end if;
  perform pg_advisory_xact_lock(9158831);
 if not exists(select 1 from public.class_sections where academic_year=p_academic_year) then
  insert into public.class_sections(id,program,year_level,track,block_label,curriculum_id,academic_year,active)
  select s.id||'_'||split_part(p_academic_year,'–',1),s.program,s.year_level,s.track,s.block_label,s.curriculum_id,p_academic_year,s.active
  from public.class_sections s where s.academic_year='2026–2027'
  on conflict(id) do nothing;
 end if;
  select count(*) into v_sections from public.class_sections
 where academic_year=p_academic_year and active=true;
 if v_sections<>11 then raise exception 'Expected 11 configured blocks for academic year %, found %. Configure sections before changing semesters.',p_academic_year,v_sections;end if;
 update public.academic_terms set is_active=false where is_active=true;
 insert into public.academic_terms(academic_year,semester,is_active)
 values(p_academic_year,p_semester,true)
 on conflict(academic_year,semester) do update set is_active=true
 returning id into v_id;
 insert into public.course_offerings(academic_term_id,class_section_id,curriculum_course_id,status)
 select v_id,s.id,c.id,case when c.verification_status='verified' then 'available' else 'suspended' end
 from public.class_sections s
 join public.curriculum_courses c on c.curriculum_id=s.curriculum_id and c.year_level=s.year_level and c.semester=p_semester
 where s.academic_year=p_academic_year and s.active=true
 on conflict(academic_term_id,class_section_id,curriculum_course_id) do nothing;
 return v_id;
end;$function$
;
