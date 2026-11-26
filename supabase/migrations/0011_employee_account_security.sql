-- Employee account administration hardening.
-- A disabled profile must not retain elevated authorization through role helpers.
create or replace function public.has_role(required_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid()
      and ur.role = required_role
      and p.is_active = true
  );
$$;
