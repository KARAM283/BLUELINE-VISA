-- VISA pipeline management and safe application transfers.
-- Applied to Supabase as:
-- 20261125104412 visa_pipelines_and_application_moves
-- 20261125104428 fix_pipeline_move_audit
-- 20261125104617 restrict_pipeline_rpc_to_authenticated

create or replace function public.create_visa_pipeline(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pipeline_id uuid;
begin
  if auth.uid() is null or not public.can_manage_cases() then
    raise exception 'Not authorized to create pipelines';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'Pipeline name is required';
  end if;

  insert into public.workflow_templates(name, country_id, visa_type_id, is_active)
  values (btrim(p_name), null, null, true)
  returning id into v_pipeline_id;

  insert into public.workflow_stages(workflow_id, name, position, is_terminal)
  values (v_pipeline_id, 'جديد', 0, false);

  return v_pipeline_id;
end;
$$;

create or replace function public.move_case_to_pipeline(p_case_id uuid, p_pipeline_id uuid)
returns public.visa_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case public.visa_cases;
  v_old_pipeline_id uuid;
  v_pipeline public.workflow_templates;
  v_stage public.workflow_stages;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_case from public.visa_cases where id = p_case_id for update;
  if not found then raise exception 'Application not found'; end if;

  if not (v_case.created_by = auth.uid() or v_case.assigned_to = auth.uid() or public.can_manage_cases()) then
    raise exception 'Not authorized to move this application';
  end if;

  v_old_pipeline_id := v_case.workflow_id;

  select * into v_pipeline from public.workflow_templates
  where id = p_pipeline_id and is_active = true;
  if not found then raise exception 'Target pipeline is unavailable'; end if;

  if (v_pipeline.country_id is not null and v_pipeline.country_id <> v_case.country_id)
     or (v_pipeline.visa_type_id is not null and v_pipeline.visa_type_id <> v_case.visa_type_id) then
    raise exception 'Target pipeline does not match this visa application';
  end if;

  select * into v_stage from public.workflow_stages
  where workflow_id = p_pipeline_id order by position asc, id asc limit 1;
  if not found then raise exception 'Target pipeline has no stages'; end if;

  if v_old_pipeline_id = p_pipeline_id then return v_case; end if;

  insert into public.case_stage_history(case_id, from_stage_id, to_stage_id, changed_by, comment)
  values (v_case.id, v_case.current_stage_id, v_stage.id, auth.uid(), 'Moved to pipeline: ' || v_pipeline.name);

  update public.visa_cases
  set workflow_id = p_pipeline_id,
      current_stage_id = v_stage.id,
      status = case when v_stage.is_terminal then 'completed' when status = 'completed' then 'open' else status end,
      closed_at = case when v_stage.is_terminal then now() when status = 'completed' then null else closed_at end,
      updated_at = now()
  where id = p_case_id returning * into v_case;

  insert into public.activity_logs(actor_id, case_id, action, details)
  values (auth.uid(), p_case_id, 'case.pipeline_changed',
    jsonb_build_object('from_pipeline_id', v_old_pipeline_id, 'to_pipeline_id', p_pipeline_id, 'to_stage_id', v_stage.id));

  return v_case;
end;
$$;

revoke all on function public.create_visa_pipeline(text) from public, anon;
revoke all on function public.move_case_to_pipeline(uuid, uuid) from public, anon;
grant execute on function public.create_visa_pipeline(text) to authenticated;
grant execute on function public.move_case_to_pipeline(uuid, uuid) to authenticated;
