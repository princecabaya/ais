-- Administrator-controlled academic semester and catalog activation.
CREATE OR REPLACE FUNCTION public.admin_activate_academic_term(p_academic_year text, p_semester integer)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id bigint;v_sections integer;v_created integer;
begin
 if not public.is_admin() then raise exception 'Administrator access required';end if;
 if p_semester not in (1,2) then raise exception 'Semester must be first or second';end if;
 if p_academic_year !~ '^[0-9]{4}–[0-9]{4}$' then raise exception 'Academic year must use YYYY–YYYY';end if;
 perform pg_advisory_xact_lock(9158831);
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
revoke all on function public.admin_activate_academic_term(text,integer) from public;
grant execute on function public.admin_activate_academic_term(text,integer) to authenticated;
-- Private Faculty Workload master storage and access rules.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('faculty-workload-templates','faculty-workload-templates',false,2097152,array['application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/octet-stream'])
on conflict(id) do update set public=false,file_size_limit=2097152,allowed_mime_types=excluded.allowed_mime_types;
create policy "Authenticated faculty may download master workload" on storage.objects for select to authenticated using(bucket_id='faculty-workload-templates' and name='PSU-ACA-031-master.docx');
create policy "Administrators can save master workload" on storage.objects for insert to authenticated with check(bucket_id='faculty-workload-templates' and name='PSU-ACA-031-master.docx' and (select public.is_admin()));
create policy "Administrators may replace workload master" on storage.objects for update to authenticated using(bucket_id='faculty-workload-templates' and name='PSU-ACA-031-master.docx' and (select public.is_admin())) with check(bucket_id='faculty-workload-templates' and name='PSU-ACA-031-master.docx' and (select public.is_admin()));
