-- Self-service faculty workload details with administrator-protected equivalents.
alter table public.faculty_workload_details add column if not exists research_time text;
alter table public.faculty_workload_details add column if not exists research_day text;
alter table public.faculty_workload_details add column if not exists extension_time text;
alter table public.faculty_workload_details add column if not exists extension_day text;
alter table public.faculty_workload_details add column if not exists production_time text;
alter table public.faculty_workload_details add column if not exists production_day text;
alter table public.faculty_workload_details add column if not exists cocurricular_time text;
alter table public.faculty_workload_details add column if not exists cocurricular_day text;
alter table public.faculty_workload_details add column if not exists administrative_time text;
alter table public.faculty_workload_details add column if not exists administrative_day text;
CREATE OR REPLACE FUNCTION public.save_faculty_workload_profile(p_faculty_id uuid, p_details jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_term bigint;v_is_admin boolean;
begin
 v_is_admin:=public.is_admin();
 if auth.uid() is null or (auth.uid()<>p_faculty_id and not v_is_admin) then raise exception 'You may update only your own profile';end if;
 if not exists(select 1 from public.profiles where id=p_faculty_id and status='active') then raise exception 'Active faculty account required';end if;
 if jsonb_typeof(p_details)<>'object' then raise exception 'Invalid profile details';end if;
 select id into v_term from public.academic_terms where is_active=true;
 if v_term is null then raise exception 'No active semester';end if;
 if length(coalesce(p_details->>'years_at_psu',''))>1200 then raise exception 'Field too long: years_at_psu';end if;
 if length(coalesce(p_details->>'academic_rank',''))>1200 then raise exception 'Field too long: academic_rank';end if;
 if length(coalesce(p_details->>'govt_service_years',''))>1200 then raise exception 'Field too long: govt_service_years';end if;
 if length(coalesce(p_details->>'bachelors_degree',''))>1200 then raise exception 'Field too long: bachelors_degree';end if;
 if length(coalesce(p_details->>'masters_degree',''))>1200 then raise exception 'Field too long: masters_degree';end if;
 if length(coalesce(p_details->>'doctoral_degree',''))>1200 then raise exception 'Field too long: doctoral_degree';end if;
 if length(coalesce(p_details->>'designation',''))>1200 then raise exception 'Field too long: designation';end if;
 if length(coalesce(p_details->>'consultation_schedule',''))>1200 then raise exception 'Field too long: consultation_schedule';end if;
 if length(coalesce(p_details->>'research_details',''))>1200 then raise exception 'Field too long: research_details';end if;
 if length(coalesce(p_details->>'research_time',''))>1200 then raise exception 'Field too long: research_time';end if;
 if length(coalesce(p_details->>'research_day',''))>1200 then raise exception 'Field too long: research_day';end if;
 if length(coalesce(p_details->>'extension_details',''))>1200 then raise exception 'Field too long: extension_details';end if;
 if length(coalesce(p_details->>'extension_time',''))>1200 then raise exception 'Field too long: extension_time';end if;
 if length(coalesce(p_details->>'extension_day',''))>1200 then raise exception 'Field too long: extension_day';end if;
 if length(coalesce(p_details->>'production_details',''))>1200 then raise exception 'Field too long: production_details';end if;
 if length(coalesce(p_details->>'production_time',''))>1200 then raise exception 'Field too long: production_time';end if;
 if length(coalesce(p_details->>'production_day',''))>1200 then raise exception 'Field too long: production_day';end if;
 if length(coalesce(p_details->>'cocurricular_details',''))>1200 then raise exception 'Field too long: cocurricular_details';end if;
 if length(coalesce(p_details->>'cocurricular_time',''))>1200 then raise exception 'Field too long: cocurricular_time';end if;
 if length(coalesce(p_details->>'cocurricular_day',''))>1200 then raise exception 'Field too long: cocurricular_day';end if;
 if length(coalesce(p_details->>'administrative_details',''))>1200 then raise exception 'Field too long: administrative_details';end if;
 if length(coalesce(p_details->>'administrative_time',''))>1200 then raise exception 'Field too long: administrative_time';end if;
 if length(coalesce(p_details->>'administrative_day',''))>1200 then raise exception 'Field too long: administrative_day';end if;
 if v_is_admin and nullif(p_details->>'research_hours','')::numeric is not null and (nullif(p_details->>'research_hours','')::numeric<0 or nullif(p_details->>'research_hours','')::numeric>80) then raise exception 'Invalid WHE';end if;
 if v_is_admin and nullif(p_details->>'extension_hours','')::numeric is not null and (nullif(p_details->>'extension_hours','')::numeric<0 or nullif(p_details->>'extension_hours','')::numeric>80) then raise exception 'Invalid WHE';end if;
 if v_is_admin and nullif(p_details->>'production_hours','')::numeric is not null and (nullif(p_details->>'production_hours','')::numeric<0 or nullif(p_details->>'production_hours','')::numeric>80) then raise exception 'Invalid WHE';end if;
 if v_is_admin and nullif(p_details->>'cocurricular_hours','')::numeric is not null and (nullif(p_details->>'cocurricular_hours','')::numeric<0 or nullif(p_details->>'cocurricular_hours','')::numeric>80) then raise exception 'Invalid WHE';end if;
 if v_is_admin and nullif(p_details->>'administrative_hours','')::numeric is not null and (nullif(p_details->>'administrative_hours','')::numeric<0 or nullif(p_details->>'administrative_hours','')::numeric>80) then raise exception 'Invalid WHE';end if;
 insert into public.faculty_workload_details(faculty_id,academic_term_id,years_at_psu,academic_rank,govt_service_years,bachelors_degree,masters_degree,doctoral_degree,designation,consultation_schedule,research_details,research_time,research_day,extension_details,extension_time,extension_day,production_details,production_time,production_day,cocurricular_details,cocurricular_time,cocurricular_day,administrative_details,administrative_time,administrative_day,research_hours,extension_hours,production_hours,cocurricular_hours,administrative_hours,amended_by)
 values(p_faculty_id,v_term,nullif(trim(p_details->>'years_at_psu'),''),nullif(trim(p_details->>'academic_rank'),''),nullif(trim(p_details->>'govt_service_years'),''),nullif(trim(p_details->>'bachelors_degree'),''),nullif(trim(p_details->>'masters_degree'),''),nullif(trim(p_details->>'doctoral_degree'),''),nullif(trim(p_details->>'designation'),''),nullif(trim(p_details->>'consultation_schedule'),''),nullif(trim(p_details->>'research_details'),''),nullif(trim(p_details->>'research_time'),''),nullif(trim(p_details->>'research_day'),''),nullif(trim(p_details->>'extension_details'),''),nullif(trim(p_details->>'extension_time'),''),nullif(trim(p_details->>'extension_day'),''),nullif(trim(p_details->>'production_details'),''),nullif(trim(p_details->>'production_time'),''),nullif(trim(p_details->>'production_day'),''),nullif(trim(p_details->>'cocurricular_details'),''),nullif(trim(p_details->>'cocurricular_time'),''),nullif(trim(p_details->>'cocurricular_day'),''),nullif(trim(p_details->>'administrative_details'),''),nullif(trim(p_details->>'administrative_time'),''),nullif(trim(p_details->>'administrative_day'),''),case when v_is_admin then nullif(p_details->>'research_hours','')::numeric else (select research_hours from public.faculty_workload_details where faculty_id=p_faculty_id and academic_term_id=v_term) end,case when v_is_admin then nullif(p_details->>'extension_hours','')::numeric else (select extension_hours from public.faculty_workload_details where faculty_id=p_faculty_id and academic_term_id=v_term) end,case when v_is_admin then nullif(p_details->>'production_hours','')::numeric else (select production_hours from public.faculty_workload_details where faculty_id=p_faculty_id and academic_term_id=v_term) end,case when v_is_admin then nullif(p_details->>'cocurricular_hours','')::numeric else (select cocurricular_hours from public.faculty_workload_details where faculty_id=p_faculty_id and academic_term_id=v_term) end,case when v_is_admin then nullif(p_details->>'administrative_hours','')::numeric else (select administrative_hours from public.faculty_workload_details where faculty_id=p_faculty_id and academic_term_id=v_term) end,auth.uid())
 on conflict(faculty_id,academic_term_id) do update set
 years_at_psu=excluded.years_at_psu,
 academic_rank=excluded.academic_rank,
 govt_service_years=excluded.govt_service_years,
 bachelors_degree=excluded.bachelors_degree,
 masters_degree=excluded.masters_degree,
 doctoral_degree=excluded.doctoral_degree,
 designation=excluded.designation,
 consultation_schedule=excluded.consultation_schedule,
 research_details=excluded.research_details,
 research_time=excluded.research_time,
 research_day=excluded.research_day,
 extension_details=excluded.extension_details,
 extension_time=excluded.extension_time,
 extension_day=excluded.extension_day,
 production_details=excluded.production_details,
 production_time=excluded.production_time,
 production_day=excluded.production_day,
 cocurricular_details=excluded.cocurricular_details,
 cocurricular_time=excluded.cocurricular_time,
 cocurricular_day=excluded.cocurricular_day,
 administrative_details=excluded.administrative_details,
 administrative_time=excluded.administrative_time,
 administrative_day=excluded.administrative_day,
 research_hours=excluded.research_hours,
 extension_hours=excluded.extension_hours,
 production_hours=excluded.production_hours,
 cocurricular_hours=excluded.cocurricular_hours,
 administrative_hours=excluded.administrative_hours,amended_by=auth.uid(),amended_at=now();
end;$function$
;
revoke all on function public.save_faculty_workload_profile(uuid,jsonb) from public;
grant execute on function public.save_faculty_workload_profile(uuid,jsonb) to authenticated;
