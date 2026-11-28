-- Blue Line Visa security hardening
-- Require active profiles for all authenticated access to RLS-protected application tables.
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_active = true
    );
$$;

revoke all on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated, service_role;

do $$
declare t record;
begin
  for t in
    select n.nspname, c.relname
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')
      and c.relrowsecurity=true and c.relname <> 'profiles'
  loop
    execute format('drop policy if exists active_user_gate on %I.%I',t.nspname,t.relname);
    execute format('create policy active_user_gate on %I.%I as restrictive for all to authenticated using (public.is_active_user()) with check (public.is_active_user())',t.nspname,t.relname);
  end loop;
end;
$$;

drop policy if exists active_user_gate on storage.objects;
create policy active_user_gate on storage.objects as restrictive for all to authenticated
using (public.is_active_user()) with check (public.is_active_user());

revoke all on function public.can_manage_cases() from public, anon;
revoke all on function public.has_role(public.app_role) from public, anon;
revoke all on function public.create_visa_pipeline(text) from public, anon;
revoke all on function public.move_case_to_pipeline(uuid, uuid) from public, anon;
grant execute on function public.can_manage_cases() to authenticated, service_role;
grant execute on function public.has_role(public.app_role) to authenticated, service_role;
grant execute on function public.create_visa_pipeline(text) to authenticated, service_role;
grant execute on function public.move_case_to_pipeline(uuid, uuid) to authenticated, service_role;
