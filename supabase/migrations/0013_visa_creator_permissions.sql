drop policy if exists "cases create self or manager" on public.visa_cases;
create policy "cases create self or manager"
on public.visa_cases
for insert
to authenticated
with check (
  (
    (public.has_role('employee') or public.has_role('visa_creator'))
    and created_by = (select auth.uid())
    and (assigned_to is null or assigned_to = (select auth.uid()))
  )
  or public.can_manage_cases()
);

drop policy if exists "cases update owner assignee or manager" on public.visa_cases;
create policy "cases update owner assignee or manager"
on public.visa_cases
for update
to authenticated
using (
  (
    public.has_role('employee')
    and (created_by = (select auth.uid()) or assigned_to = (select auth.uid()))
  )
  or public.can_manage_cases()
)
with check (
  (
    public.has_role('employee')
    and (created_by = (select auth.uid()) or assigned_to = (select auth.uid()))
  )
  or public.can_manage_cases()
);

create or replace function public.move_case_to_pipeline(p_case_id uuid, p_pipeline_id uuid)
returns public.visa_cases
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_case public.visa_cases;
  v_old_pipeline_id uuid;
  v_pipeline public.visa_pipelines;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_case from public.visa_cases where id = p_case_id for update;
  if not found then raise exception 'Application not found'; end if;
  if not (
    public.can_manage_cases()
    or (
      public.has_role('employee')
      and (v_case.created_by = auth.uid() or v_case.assigned_to = auth.uid())
    )
  ) then
    raise exception 'Not authorized to move this application';
  end if;
  v_old_pipeline_id := v_case.pipeline_id;
  select * into v_pipeline from public.visa_pipelines where id = p_pipeline_id and is_active = true;
  if not found then raise exception 'Target pipeline is unavailable'; end if;
  if v_old_pipeline_id = p_pipeline_id then return v_case; end if;
  update public.visa_cases set pipeline_id = p_pipeline_id, updated_at = now()
  where id = p_case_id returning * into v_case;
  insert into public.activity_logs(actor_id, case_id, action, details)
  values (auth.uid(), p_case_id, 'case.pipeline_changed',
    jsonb_build_object('from_pipeline_id', v_old_pipeline_id, 'to_pipeline_id', p_pipeline_id));
  return v_case;
end;
$function$;
