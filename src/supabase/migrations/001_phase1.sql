-- PSU Balabac Faculty Scheduler: Phase 1
-- Run in a NEW Supabase project only. Never in the examination project.
create extension if not exists citext with schema extensions;

create table public.faculty_invitations (
 email text primary key,
 department text not null check (department in ('BEEd','BSE')),
 invited_by uuid,
 created_at timestamptz not null default now(),
 used_at timestamptz,
 constraint invited_psu_email check (email = lower(email) and email ~ '^[^@[:space:]]+@psu\.palawan\.edu\.ph$')
);

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null unique,
 username text not null unique check (username ~ '^[a-z0-9._-]{3,30}$'),
 first_name text not null check(first_name=upper(first_name) and length(trim(first_name))>0),
 last_name text not null check(last_name=upper(last_name) and length(trim(last_name))>0),
 middle_initial text check(middle_initial is null or middle_initial ~ '^[A-Z]\.$'),
 department text not null check (department in ('BEEd','BSE')),
 employment_type text not null check (employment_type in ('regular','part_time')),
 role text not null default 'faculty' check(role in ('faculty','admin')),
 status text not null default 'active' check(status in ('active','pending','disabled')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint profile_email_domain check (email=lower(email) and email ~ '^[^@[:space:]]+@psu\.palawan\.edu\.ph$')
);

create or replace function public.is_admin() returns boolean language sql security definer stable set search_path='' as $$
 select exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.status='active');
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Public boolean check is needed BEFORE an authenticated faculty account exists.
-- Only discloses whether a given corporate address has been pre-authorized.
create or replace function public.is_invited_email(candidate_email text) returns boolean language sql security definer stable set search_path='' as $$
 select candidate_email = lower(candidate_email)
 and candidate_email ~ '^[^@[:space:]]+@psu\.palawan\.edu\.ph$'
 and exists(select 1 from public.faculty_invitations i where i.email=candidate_email);
$$;
revoke all on function public.is_invited_email(text) from public;
grant execute on function public.is_invited_email(text) to anon,authenticated;

-- Prevent direct auth signups with unapproved addresses, including bypasses of the UI.
create or replace function public.enforce_faculty_invite() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.email is null or new.email <> lower(new.email)
   or new.email !~ '^[^@[:space:]]+@psu\.palawan\.edu\.ph$'
   or not exists(select 1 from public.faculty_invitations where email = new.email) then
  raise exception 'University email not authorized';
 end if;
 return new;
end;
$$;
create trigger enforce_faculty_invite_before_signup before insert on auth.users
 for each row execute function public.enforce_faculty_invite();

-- Email, role and approval status are assigned server-side from the invitation.
create or replace function public.fill_profile_secure_fields() returns trigger language plpgsql security definer set search_path='' as $$
declare email_value text; invite_dept text;
begin
 if auth.uid() is distinct from new.id then raise exception 'Invalid faculty identity'; end if;
 select lower(u.email) into email_value from auth.users u where u.id=new.id and u.email_confirmed_at is not null;
 if email_value is null then raise exception 'Verified PSU email required'; end if;
 select department into invite_dept from public.faculty_invitations where email=email_value;
 if invite_dept is null then raise exception 'Faculty invitation missing'; end if;
 if new.department<>invite_dept then raise exception 'Department must match invitation'; end if;
 new.email:=email_value;
 new.role:='faculty';
 new.status:='active';
 return new;
end;
$$;
create trigger fill_profile_secure_fields_before_insert before insert on public.profiles
 for each row execute function public.fill_profile_secure_fields();

create or replace function public.mark_invitation_used() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.faculty_invitations set used_at=coalesce(used_at,now()) where email=new.email;
 return new;
end;
$$;
create trigger mark_invitation_used_after_profile after insert on public.profiles
 for each row execute function public.mark_invitation_used();

alter table public.profiles enable row level security;
alter table public.faculty_invitations enable row level security;
create policy "Own active profile or admin reads profiles" on public.profiles for select to authenticated using (id=auth.uid() or public.is_admin());
create policy "Faculty inserts only own verified profile" on public.profiles for insert to authenticated with check (id=auth.uid());
-- Do not allow client profile UPDATE initially. A dedicated secure RPC is needed to edit protected fields.
create policy "Only admin reads invitations" on public.faculty_invitations for select to authenticated using (public.is_admin());
create policy "Only admin creates invitations" on public.faculty_invitations for insert to authenticated with check (public.is_admin() and invited_by=auth.uid());
create policy "Only admin removes unused invitations" on public.faculty_invitations for delete to authenticated using (public.is_admin() and used_at is null);

-- Seed admin manually in SQL editor AFTER the initial invited admin signs up and completes profile:
-- update public.profiles set role='admin' where email='YOUR_ADMIN@psu.palawan.edu.ph';
-- The profile trigger intentionally never allows self-promotion to admin.
