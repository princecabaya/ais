-- Private faculty-to-administrator help chat; existing table and messages require authenticated ownership.
create table public.faculty_help_threads (
 id bigint generated always as identity primary key,
 faculty_id uuid not null unique references public.profiles(id),
 subject text not null default 'Scheduling help',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.faculty_help_messages (
 id bigint generated always as identity primary key,
 thread_id bigint not null references public.faculty_help_threads(id) on delete cascade,
 sender_id uuid not null references public.profiles(id),
 body text not null check(length(trim(body)) between 1 and 2000),
 created_at timestamptz not null default now(),
 read_at timestamptz
);
create index faculty_help_messages_thread_time on public.faculty_help_messages(thread_id,created_at);
alter table public.faculty_help_threads enable row level security;
alter table public.faculty_help_messages enable row level security;
grant select on public.faculty_help_threads, public.faculty_help_messages to authenticated;
create policy "Own help thread or administrator" on public.faculty_help_threads for select to authenticated
 using(faculty_id=(select auth.uid()) or (select public.is_admin()));
create policy "Own help messages or administrator" on public.faculty_help_messages for select to authenticated
 using(exists(select 1 from public.faculty_help_threads t where t.id=thread_id and (t.faculty_id=(select auth.uid()) or (select public.is_admin()))));
CREATE OR REPLACE FUNCTION public.send_faculty_help_message(p_thread_id bigint, p_body text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_thread bigint;v_owner uuid;v_id bigint;v_uid uuid:=auth.uid();
begin
 if v_uid is null or not exists(select 1 from public.profiles where id=v_uid and status='active') then raise exception 'Active faculty account required';end if;
 if length(trim(coalesce(p_body,''))) not between 1 and 2000 then raise exception 'Message must be 1 to 2000 characters';end if;
 if p_thread_id is null then
  if public.is_admin() then raise exception 'Select an existing faculty conversation first';end if;
  insert into public.faculty_help_threads(faculty_id) values(v_uid)
  on conflict(faculty_id) do update set updated_at=now()
  returning id,faculty_id into v_thread,v_owner;
 else
  select id,faculty_id into v_thread,v_owner from public.faculty_help_threads where id=p_thread_id for update;
  if v_thread is null or (v_owner<>v_uid and not public.is_admin()) then raise exception 'Conversation access denied';end if;
 end if;
 insert into public.faculty_help_messages(thread_id,sender_id,body) values(v_thread,v_uid,trim(p_body)) returning id into v_id;
 update public.faculty_help_threads set updated_at=now() where id=v_thread;
 return v_id;
end;$function$
;
revoke all on function public.send_faculty_help_message(bigint,text) from public;
grant execute on function public.send_faculty_help_message(bigint,text) to authenticated;
