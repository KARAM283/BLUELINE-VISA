-- Apply the active-account restriction to profile self-service too.
drop policy if exists active_user_gate on public.profiles;
create policy active_user_gate on public.profiles as restrictive for all to authenticated
using (public.is_active_user()) with check (public.is_active_user());
