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

  if to_regclass('public.workflow_templates') is not null
     or to_regclass('public.workflow_stages') is not null
     or to_regclass('public.case_stage_history') is not null then
    raise exception 'Legacy workflow and stage objects should not exist';
  end if;

  if has_function_privilege('anon','public.move_case_to_pipeline(uuid,uuid)','EXECUTE') then
    raise exception 'anon can execute move_case_to_pipeline';
  end if;

  if not has_function_privilege('authenticated','public.move_case_to_pipeline(uuid,uuid)','EXECUTE') then
    raise exception 'authenticated cannot execute move_case_to_pipeline';
  end if;
end $$;
