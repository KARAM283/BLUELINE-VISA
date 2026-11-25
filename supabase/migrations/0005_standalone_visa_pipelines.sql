-- Replace the legacy workflow/stage model with standalone VISA pipelines.
begin;

create table if not exists public.visa_pipelines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

do $$
begin
  if to_regclass('public.workflow_templates') is not null then
    insert into public.visa_pipelines (id,name,is_active,created_at)
    select id,name,is_active,created_at
    from public.workflow_templates
    on conflict (id) do nothing;
  end if;
end $$;

alter table public.visa_pipelines drop column if exists country_id;
alter table public.visa_pipelines drop column if exists visa_type_id;

alter table public.visa_cases add column if not exists pipeline_id uuid;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='visa_cases' and column_name='workflow_id'
  ) then
    execute 'update public.visa_cases set pipeline_id = workflow_id where pipeline_id is null';
  end if;
end $$;

alter table public.visa_cases alter column pipeline_id set not null;

drop trigger if exists visa_cases_guard_stage_transition on public.visa_cases;
drop trigger if exists visa_cases_validate_configuration on public.visa_cases;

alter table public.visa_cases drop constraint if exists visa_cases_current_stage_id_workflow_id_fkey;
alter table public.visa_cases drop constraint if exists visa_cases_workflow_id_fkey;
alter table public.visa_cases drop constraint if exists visa_cases_workflow_id_fkey1;
alter table public.visa_cases drop constraint if exists visa_cases_pipeline_id_fkey;

alter table public.visa_cases drop column if exists current_stage_id;
alter table public.visa_cases drop column if exists workflow_id;

alter table public.visa_cases
  add constraint visa_cases_pipeline_id_fkey
  foreign key (pipeline_id) references public.visa_pipelines(id);

create index if not exists visa_cases_pipeline_idx on public.visa_cases(pipeline_id);

drop table if exists public.case_stage_history;
drop table if exists public.sla_rules;

drop function if exists public.transition_case_stage(uuid,uuid,text);
drop function if exists public.guard_case_stage_transition();
drop function if exists public.validate_case_configuration();

drop table if exists public.workflow_stages;
drop table if exists public.workflow_templates;

create or replace function public.validate_visa_case_configuration()
returns trigger
language plpgsql
set search_path = public
as $$
declare vt_country uuid;
begin
  select country_id into vt_country from public.visa_types where id = new.visa_type_id;
  if vt_country is distinct from new.country_id then
    raise exception 'Visa type does not belong to the selected country';
  end if;
  return new;
end;
$$;

drop trigger if exists visa_cases_validate_configuration on public.visa_cases;
create trigger visa_cases_validate_configuration
before insert or update of country_id, visa_type_id
on public.visa_cases
for each row execute procedure public.validate_visa_case_configuration();

revoke all on function public.validate_visa_case_configuration() from public, anon, authenticated;

create or replace function public.create_visa_pipeline(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_pipeline_id uuid;
begin
  if auth.uid() is null or not public.can_manage_cases() then
    raise exception 'Not authorized to create pipelines';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'Pipeline name is required';
  end if;

  insert into public.visa_pipelines(name, is_active)
  values (btrim(p_name), true)
  returning id into v_pipeline_id;

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
  v_pipeline public.visa_pipelines;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_case from public.visa_cases where id = p_case_id for update;
  if not found then raise exception 'Application not found'; end if;

  if not (v_case.created_by = auth.uid() or v_case.assigned_to = auth.uid() or public.can_manage_cases()) then
    raise exception 'Not authorized to move this application';
  end if;

  v_old_pipeline_id := v_case.pipeline_id;

  select * into v_pipeline from public.visa_pipelines
  where id = p_pipeline_id and is_active = true;
  if not found then raise exception 'Target pipeline is unavailable'; end if;

  if v_old_pipeline_id = p_pipeline_id then return v_case; end if;

  update public.visa_cases
  set pipeline_id = p_pipeline_id, updated_at = now()
  where id = p_case_id
  returning * into v_case;

  insert into public.activity_logs(actor_id, case_id, action, details)
  values (auth.uid(), p_case_id, 'case.pipeline_changed',
    jsonb_build_object('from_pipeline_id', v_old_pipeline_id, 'to_pipeline_id', p_pipeline_id));

  return v_case;
end;
$$;

revoke all on function public.create_visa_pipeline(text) from public, anon;
revoke all on function public.move_case_to_pipeline(uuid,uuid) from public, anon;
grant execute on function public.create_visa_pipeline(text) to authenticated;
grant execute on function public.move_case_to_pipeline(uuid,uuid) to authenticated;

alter table public.visa_pipelines enable row level security;
drop policy if exists "pipelines read" on public.visa_pipelines;
create policy "pipelines read" on public.visa_pipelines
for select to authenticated using (true);
drop policy if exists "pipelines managers manage" on public.visa_pipelines;
create policy "pipelines managers manage" on public.visa_pipelines
for all to authenticated
using (public.can_manage_cases())
with check (public.can_manage_cases());

grant select, insert, update, delete on public.visa_pipelines to authenticated;

commit;
