-- Run with a privileged test connection after applying migrations to a disposable Supabase project.
do $$
declare missing text[];
begin
  select array_agg(t) into missing
  from unnest(array[
    'profiles','user_roles','countries','visa_types','visa_pipelines',
    'visa_cases','document_types','document_requirements','case_documents',
    'case_notes','tasks','appointments','case_finances','payments','notifications','activity_logs',
    'message_templates','message_queue'
  ]) as t
  where to_regclass('public.'||t) is null;
  if missing is not null then raise exception 'Missing tables: %',missing; end if;

  if not exists(select 1 from pg_class where oid='public.visa_cases'::regclass and relrowsecurity) then
    raise exception 'RLS is not enabled on visa_cases';
  end if;
  if not exists(select 1 from pg_class where oid='public.visa_pipelines'::regclass and relrowsecurity) then
    raise exception 'RLS is not enabled on visa_pipelines';
  end if;
  if not exists(select 1 from storage.buckets where id='visa-case-documents' and public=false) then
    raise exception 'Private visa-case-documents bucket is missing';
  end if;
  if to_regprocedure('public.move_case_to_pipeline(uuid,uuid)') is null then
    raise exception 'move_case_to_pipeline RPC is missing';
  end if;
  if to_regclass('public.workflow_templates') is not null or to_regclass('public.workflow_stages') is not null then
    raise exception 'Legacy workflow tables should not exist';
  end if;
end $$;
