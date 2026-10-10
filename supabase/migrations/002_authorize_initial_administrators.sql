-- Phase 1: bootstrap campus administrators and support later admin grants.
-- Applied to the independent AIS Supabase project (ugtgxsnqiychmmarjciz).
alter table public.faculty_invitations drop constraint if exists faculty_invitations_department_check;
alter table public.faculty_invitations add constraint faculty_invitations_department_check check (department in ('BEEd','BSE','Administration'));
alter table public.profiles drop constraint if exists profiles_department_check;
alter table public.profiles add constraint profiles_department_check check (department in ('BEEd','BSE','Administration'));

create table public.administrator_authorizations (
 email text primary key references public.faculty_invitations(email) on delete cascade,
 authorized_by uuid references auth.users(id) on delete set null,
 authorized_at timestamptz not null default now()
);
alter table public.administrator_authorizations enable row level security;
create policy "Admins may view administrator authorizations" on public.administrator_authorizations for select to authenticated using (public.is_admin());

create or replace function public.grant_administrator(candidate_email text)
returns void language plpgsql security definer set search_path='' as $$
declare normalized_email text := lower(trim(candidate_email));
begin
 if not public.is_admin() then raise exception 'Administrator permission required'; end if;
 if not exists(select 1 from public.faculty_invitations where email=normalized_email) then
  raise exception 'Authorize this PSU email as faculty first';
 end if;
 insert into public.administrator_authorizations(email,authorized_by)
 values(normalized_email,auth.uid()) on conflict(email) do nothing;
 update public.profiles set role='admin',updated_at=now() where email=normalized_email;
end; $$;
revoke all on function public.grant_administrator(text) from public;
grant execute on function public.grant_administrator(text) to authenticated;

create or replace function public.fill_profile_secure_fields()
returns trigger language plpgsql security definer set search_path='' as $$
declare email_value text; invite_dept text;
begin
 if auth.uid() is distinct from new.id then raise exception 'Invalid faculty identity'; end if;
 select lower(u.email) into email_value from auth.users u where u.id=new.id and u.email_confirmed_at is not null;
 if email_value is null then raise exception 'Verified PSU email required'; end if;
 select department into invite_dept from public.faculty_invitations where email=email_value;
 if invite_dept is null then raise exception 'Faculty invitation missing'; end if;
 if new.department<>invite_dept then raise exception 'Department must match invitation'; end if;
 new.email:=email_value;
 new.role:=case when exists(select 1 from public.administrator_authorizations where email=email_value) then 'admin' else 'faculty' end;
 new.status:='active';
 return new;
end; $$;

insert into public.faculty_invitations(email,department)
values('aibrahim@psu.palawan.edu.ph','Administration'),
      ('pjcabayacruz@psu.palawan.edu.ph','BEEd')
on conflict(email) do nothing;
insert into public.administrator_authorizations(email,authorized_by)
values('aibrahim@psu.palawan.edu.ph',null),
      ('pjcabayacruz@psu.palawan.edu.ph',null)
on conflict(email) do nothing;
