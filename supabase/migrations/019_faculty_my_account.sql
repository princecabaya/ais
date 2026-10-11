-- Faculty can change their own username, legal name and contact information only.
-- Email, department, employment type, authorization role and status remain administrator-controlled.
alter table public.profiles add column if not exists contact_number text;
alter table public.profiles add column if not exists office_location text;
CREATE OR REPLACE FUNCTION public.update_my_faculty_account(p_username text, p_first_name text, p_last_name text, p_middle_initial text, p_contact_number text, p_office_location text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid();
begin
 if v_uid is null or not exists(select 1 from public.profiles where id=v_uid and status='active') then
  raise exception 'An active signed-in faculty account is required';
 end if;
 if trim(coalesce(p_username,'')) !~ '^[a-zA-Z0-9._-]{3,30}$' then
  raise exception 'Username must contain 3–30 letters, numbers, dots, underscores or hyphens';
 end if;
 if length(trim(coalesce(p_first_name,''))) not between 1 and 100 or
    length(trim(coalesce(p_last_name,''))) not between 1 and 100 then
  raise exception 'Enter a first and last name, each 1–100 characters';
 end if;
 if nullif(trim(coalesce(p_middle_initial,'')),'') is not null and
    trim(p_middle_initial) !~ '^[a-zA-Z][.]?$' then
  raise exception 'Middle initial must be a single letter';
 end if;
 if length(trim(coalesce(p_contact_number,'')))>30 or length(trim(coalesce(p_office_location,'')))>150 then
  raise exception 'Contact number or office location is too long';
 end if;
 update public.profiles set
  username=lower(trim(p_username)),
  first_name=upper(trim(p_first_name)),
  last_name=upper(trim(p_last_name)),
  middle_initial=case when nullif(trim(coalesce(p_middle_initial,'')),'') is null then null
   else upper(left(trim(p_middle_initial),1))||'.' end,
  contact_number=nullif(trim(coalesce(p_contact_number,'')),''),
  office_location=nullif(trim(coalesce(p_office_location,'')),''),
  updated_at=now()
 where id=v_uid;
end;$function$
;
revoke all on function public.update_my_faculty_account(text,text,text,text,text,text) from public;
grant execute on function public.update_my_faculty_account(text,text,text,text,text,text) to authenticated;
