-- Administrator-only editing and adding courses, audit recorded in curriculum_change_log.
CREATE OR REPLACE FUNCTION public.admin_add_catalog_course(p_curriculum_id text, p_year integer, p_semester integer, p_code text, p_title text, p_units numeric, p_prerequisite text, p_verification text, p_reason text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id bigint;v_source int;
begin
 if not public.is_admin() then raise exception 'Administrator privileges required';end if;
 if length(trim(coalesce(p_reason,'')))<10 then raise exception 'Provide an authorized source or reason (10+ characters)';end if;
 if not exists(select 1 from public.curricula where id=p_curriculum_id) then raise exception 'Unknown curriculum';end if;
 if p_year not between 1 and 4 or p_semester not in (1,2) then raise exception 'Invalid year or semester';end if;
 if length(trim(coalesce(p_code,''))) not between 2 and 80 or
 length(trim(coalesce(p_title,''))) not between 3 and 300 then raise exception 'Enter a valid code and full title';end if;
 if p_units is not null and (p_units<0 or p_units>12) then raise exception 'Units must be from 0 to 12';end if;
 if p_verification not in ('verified','review_units','review_details') then raise exception 'Invalid review status';end if;
 if p_verification='verified' and p_units is null then raise exception 'Verified course needs confirmed units';end if;
 perform pg_advisory_xact_lock(hashtext(p_curriculum_id),p_year*10+p_semester);
 select coalesce(max(source_row),0)+1 into v_source from public.curriculum_courses
 where curriculum_id=p_curriculum_id and year_level=p_year and semester=p_semester;
 insert into public.curriculum_courses
 (curriculum_id,year_level,semester,course_code,course_title,units,prerequisite_text,verification_status,source_row)
 values(p_curriculum_id,p_year,p_semester,trim(p_code),trim(p_title),p_units,
 nullif(trim(coalesce(p_prerequisite,'')),''),p_verification,v_source)
 returning id into v_id;
 insert into public.course_offerings(academic_term_id,class_section_id,curriculum_course_id,status)
 select t.id,s.id,v_id,case when p_verification='verified' then 'available' else 'suspended' end
 from public.class_sections s join public.academic_terms t on t.academic_year=s.academic_year
 where s.curriculum_id=p_curriculum_id and s.year_level=p_year and s.active and t.semester=p_semester
 on conflict(academic_term_id,class_section_id,curriculum_course_id) do nothing;
 insert into public.curriculum_change_log(course_id,admin_id,field_name,old_value,new_value,reason)
 values(v_id,auth.uid(),'course_created',null,
 jsonb_build_object('curriculum',p_curriculum_id,'year',p_year,'semester',p_semester,
 'code',trim(p_code),'title',trim(p_title),'units',p_units,'verification',p_verification)::text,trim(p_reason));
 return v_id;
end;$function$
;

CREATE OR REPLACE FUNCTION public.admin_edit_catalog_course(p_course_id bigint, p_code text, p_title text, p_units numeric, p_prerequisite text, p_verification text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare oldrow public.curriculum_courses%rowtype;
begin
 if not public.is_admin() then raise exception 'Administrator privileges required';end if;
 if length(trim(coalesce(p_reason,'')))<10 then raise exception 'Explain the catalog correction in at least 10 characters';end if;
 if length(trim(coalesce(p_code,''))) not between 2 and 80 then raise exception 'Course code must be 2–80 characters';end if;
 if length(trim(coalesce(p_title,''))) not between 3 and 300 then raise exception 'Course title must be 3–300 characters';end if;
 if p_units is not null and (p_units<0 or p_units>12) then raise exception 'Units must be from 0 to 12';end if;
 if p_verification not in ('verified','review_units','review_details') then raise exception 'Invalid review status';end if;
 if p_verification='verified' and p_units is null then raise exception 'Verified course needs confirmed units';end if;
 select * into oldrow from public.curriculum_courses where id=p_course_id for update;
 if not found then raise exception 'Course not found';end if;
 if p_verification<>'verified' and exists (
  select 1 from public.faculty_course_requests r
  join public.course_offerings o on o.id=r.course_offering_id
  where o.curriculum_course_id=p_course_id and r.status='approved'
 ) then raise exception 'Cannot suspend a course with approved teaching assignments';end if;
 update public.curriculum_courses set
 course_code=trim(p_code),course_title=trim(p_title),units=p_units,
 prerequisite_text=nullif(trim(coalesce(p_prerequisite,'')),''),
 verification_status=p_verification where id=p_course_id;
 insert into public.curriculum_change_log(course_id,admin_id,field_name,old_value,new_value,reason)
 values(p_course_id,auth.uid(),'course_details',
 jsonb_build_object('code',oldrow.course_code,'title',oldrow.course_title,'units',oldrow.units,'prerequisite',oldrow.prerequisite_text,'verification',oldrow.verification_status)::text,
 jsonb_build_object('code',trim(p_code),'title',trim(p_title),'units',p_units,'prerequisite',nullif(trim(coalesce(p_prerequisite,'')),''),
 'verification',p_verification)::text,trim(p_reason));
 update public.course_offerings
 set status=case when p_verification='verified' then 'available' else 'suspended' end
 where curriculum_course_id=p_course_id and status in ('available','suspended');
end;$function$
;
revoke all on function public.admin_edit_catalog_course(bigint,text,text,numeric,text,text,text) from public;
revoke all on function public.admin_add_catalog_course(text,integer,integer,text,text,numeric,text,text,text) from public;
grant execute on function public.admin_edit_catalog_course(bigint,text,text,numeric,text,text,text) to authenticated;
grant execute on function public.admin_add_catalog_course(text,integer,integer,text,text,numeric,text,text,text) to authenticated;
