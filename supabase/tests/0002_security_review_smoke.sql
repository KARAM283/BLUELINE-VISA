-- Additional security assertions for a disposable Supabase test database.
do $$
declare
  opts text[];
begin
  if not exists (
    select 1 from pg_class
    where oid='public.case_finance_summary'::regclass
      and reloptions @> array['security_invoker=true']
  ) then
    raise exception 'case_finance_summary is not security_invoker';
  end if;

  if not exists (
    select 1 from pg_class
    where oid='public.case_number_counters'::regclass and relrowsecurity
  ) then
    raise exception 'RLS is not enabled on case_number_counters';
  end if;

  if has_table_privilege('authenticated','public.case_number_counters','SELECT') then
    raise exception 'authenticated unexpectedly has direct counter access';
  end if;

  if has_table_privilege('authenticated','public.case_stage_history','INSERT') then
    raise exception 'authenticated can forge case stage history rows';
  end if;

  if has_function_privilege('anon','public.transition_case_stage(uuid,uuid,text)','EXECUTE') then
    raise exception 'anon can execute transition_case_stage';
  end if;

  if not has_function_privilege('authenticated','public.transition_case_stage(uuid,uuid,text)','EXECUTE') then
    raise exception 'authenticated cannot execute transition_case_stage';
  end if;
end $$;
