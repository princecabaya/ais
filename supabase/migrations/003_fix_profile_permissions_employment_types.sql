-- Faculty profile access and four appointment classifications
-- Applied to AIS Supabase project ugtgxsnqiychmmarjciz
-- Keep Row Level Security enabled; these grants do not bypass RLS.

revoke all privileges on table public.profiles, public.faculty_invitations, public.administrator_authorizations from anon, authenticated;
grant select, insert on public.profiles to authenticated;
grant select, insert, delete on public.faculty_invitations to authenticated;
grant select on public.administrator_authorizations to authenticated;

alter table public.profiles drop constraint if exists profiles_employment_type_check;
alter table public.profiles add constraint profiles_employment_type_check
check (employment_type in ('regular','tempo','cos','part_time'));
comment on column public.profiles.employment_type is
'regular: plantilla; tempo: conditional plantilla; cos: contract of service; part_time: part-time. Regular, tempo and COS count as full-time.';
