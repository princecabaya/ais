-- Phase 2C faculty availability schema. Applied in Supabase AIS.
create table public.faculty_availability(
 id bigint generated always as identity primary key,
 faculty_id uuid not null references public.profiles(id) on delete cascade,
 academic_term_id bigint not null references public.academic_terms(id),
 weekday smallint not null check(weekday between 1 and 5),
 slot_index smallint not null check(slot_index between 1 and 7),
 preference text not null check(preference in ('available','preferred','unavailable')),
 note text,updated_at timestamptz not null default now(),
 unique(faculty_id,academic_term_id,weekday,slot_index),
 check(length(coalesce(note,''))<=500)
);
create table public.availability_overrides(
 id bigint generated always as identity primary key,
 faculty_id uuid not null references public.profiles(id),
 academic_term_id bigint not null references public.academic_terms(id),
 weekday smallint not null check(weekday between 1 and 5),
 slot_index smallint not null check(slot_index between 1 and 7),
 justification text not null check(length(trim(justification))>=10),
 authorized_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 revoked_at timestamptz,revoked_by uuid references public.profiles(id)
);
create unique index one_active_availability_override on public.availability_overrides(faculty_id,academic_term_id,weekday,slot_index) where revoked_at is null;
alter table public.faculty_availability enable row level security;
alter table public.availability_overrides enable row level security;
grant select on public.faculty_availability,public.availability_overrides to authenticated;
create policy "Own availability or administrative view" on public.faculty_availability for select to authenticated using(faculty_id=(select auth.uid()) or (select public.is_admin()));
create policy "Own overrides or administrative view" on public.availability_overrides for select to authenticated using(faculty_id=(select auth.uid()) or (select public.is_admin()));
create function public.set_faculty_availability(p_weekday smallint,p_slot_index smallint,p_preference text,p_note text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_term bigint;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and status='active') then raise exception 'Active faculty account required';end if;
 if p_weekday not between 1 and 5 or p_slot_index not between 1 and 7 or p_preference not in ('available','preferred','unavailable') then raise exception 'Invalid day, period, or preference';end if;
 if length(coalesce(p_note,''))>500 then raise exception 'Note exceeds 500 characters';end if;
 select id into v_term from public.academic_terms where is_active=true;
 if v_term is null then raise exception 'No active academic term';end if;
 insert into public.faculty_availability(faculty_id,academic_term_id,weekday,slot_index,preference,note)
 values(auth.uid(),v_term,p_weekday,p_slot_index,p_preference,nullif(trim(p_note),''))
 on conflict(faculty_id,academic_term_id,weekday,slot_index)
 do update set preference=excluded.preference,note=excluded.note,updated_at=now();
end;$$;
create function public.set_availability_override(p_faculty_id uuid,p_weekday smallint,p_slot_index smallint,p_justification text)
returns void language plpgsql security definer set search_path='' as $$
declare v_term bigint;
begin
 if not public.is_admin() then raise exception 'Only administrators may authorize exceptions';end if;
 if p_weekday not between 1 and 5 or p_slot_index not between 1 and 7 then raise exception 'Invalid weekday or slot';end if;
 if length(trim(coalesce(p_justification,'')))<10 then raise exception 'Provide at least 10 characters of justification';end if;
 if not exists(select 1 from public.profiles where id=p_faculty_id and status='active') then raise exception 'Faculty account is not active';end if;
 select id into v_term from public.academic_terms where is_active=true;
 if v_term is null then raise exception 'No active academic term';end if;
 if not exists(select 1 from public.faculty_availability where faculty_id=p_faculty_id and academic_term_id=v_term and weekday=p_weekday and slot_index=p_slot_index and preference='unavailable') then raise exception 'An exception is only needed for a declared unavailable period';end if;
 if exists(select 1 from public.availability_overrides where faculty_id=p_faculty_id and academic_term_id=v_term and weekday=p_weekday and slot_index=p_slot_index and revoked_at is null) then raise exception 'An active override already exists';end if;
 insert into public.availability_overrides(faculty_id,academic_term_id,weekday,slot_index,justification,authorized_by) values(p_faculty_id,v_term,p_weekday,p_slot_index,trim(p_justification),auth.uid());
end;$$;
create function public.revoke_availability_override(p_override_id bigint)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Only administrators may revoke exceptions';end if;
 update public.availability_overrides set revoked_at=now(),revoked_by=auth.uid() where id=p_override_id and revoked_at is null;
 if not found then raise exception 'Active override not found';end if;
end;$$;
revoke all on function public.set_faculty_availability(smallint,smallint,text,text) from public;
revoke all on function public.set_availability_override(uuid,smallint,smallint,text) from public;
revoke all on function public.revoke_availability_override(bigint) from public;
grant execute on function public.set_faculty_availability(smallint,smallint,text,text) to authenticated;
grant execute on function public.set_availability_override(uuid,smallint,smallint,text) to authenticated;
grant execute on function public.revoke_availability_override(bigint) to authenticated;
