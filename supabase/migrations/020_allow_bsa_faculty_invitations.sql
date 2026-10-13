-- Include graduating legacy BSA instructors in the authorized PSU faculty invitation list.
alter table public.faculty_invitations
 drop constraint if exists faculty_invitations_department_check;
alter table public.faculty_invitations
 add constraint faculty_invitations_department_check
 check (department in ('BEEd','BSE','BSA','Administration'));
