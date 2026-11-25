-- Integrity and workflow hardening for Blue Line Visa Pipeline.
create table if not exists public.case_number_counters (
  year integer primary key,
  last_value bigint not null default 0
);

create or replace function public.assign_case_number()
returns trigger language plpgsql security definer set search_path=public
as $$
declare y integer := extract(year from now())::integer;
declare n bigint;
begin
  if new.case_number is null or new.case_number = '' then
    insert into public.case_number_counters(year,last_value) values(y,1)
    on conflict(year) do update set last_value=public.case_number_counters.last_value+1
    returning last_value into n;
    new.case_number := 'BL-VISA-' || y::text || '-' || lpad(n::text,6,'0');
  end if;
  return new;
end;
$$;
drop trigger if exists visa_cases_assign_number on public.visa_cases;
create trigger visa_cases_assign_number before insert on public.visa_cases
for each row execute procedure public.assign_case_number();

-- Ensure workflow country/type configuration agrees with each case.
create or replace function public.validate_case_configuration()
returns trigger language plpgsql set search_path=public
as $$
declare vt_country uuid; wf_country uuid; wf_type uuid;
begin
  select country_id into vt_country from public.visa_types where id=new.visa_type_id;
  if vt_country is distinct from new.country_id then
    raise exception 'Visa type does not belong to the selected country';
  end if;
  select country_id,visa_type_id into wf_country,wf_type
  from public.workflow_templates where id=new.workflow_id;
  if wf_country is not null and wf_country is distinct from new.country_id then
    raise exception 'Workflow country does not match case country';
  end if;
  if wf_type is not null and wf_type is distinct from new.visa_type_id then
    raise exception 'Workflow visa type does not match case visa type';
  end if;
  return new;
end;
$$;
drop trigger if exists visa_cases_validate_configuration on public.visa_cases;
create trigger visa_cases_validate_configuration before insert or update of country_id,visa_type_id,workflow_id
on public.visa_cases for each row execute procedure public.validate_case_configuration();

-- All stage changes must pass through this RPC so history and current state stay in sync.
create or replace function public.transition_case_stage(p_case_id uuid,p_to_stage_id uuid,p_comment text default null)
returns public.visa_cases
language plpgsql security definer set search_path=public
as $$
declare c public.visa_cases; s public.workflow_stages;
begin
  select * into c from public.visa_cases where id=p_case_id for update;
  if not found then raise exception 'Case not found'; end if;
  if not (c.created_by=auth.uid() or c.assigned_to=auth.uid() or public.can_manage_cases()) then
    raise exception 'Not authorized to transition this case';
  end if;
  select * into s from public.workflow_stages where id=p_to_stage_id and workflow_id=c.workflow_id;
  if not found then raise exception 'Target stage is not part of this case workflow'; end if;
  if c.current_stage_id=p_to_stage_id then return c; end if;
  insert into public.case_stage_history(case_id,from_stage_id,to_stage_id,changed_by,comment)
  values(c.id,c.current_stage_id,p_to_stage_id,auth.uid(),p_comment);
  update public.visa_cases set current_stage_id=p_to_stage_id,updated_at=now(),
    status=case when s.is_terminal then 'completed' else status end,
    closed_at=case when s.is_terminal then now() else closed_at end
  where id=p_case_id returning * into c;
  insert into public.activity_logs(actor_id,case_id,action,details)
  values(auth.uid(),p_case_id,'case.stage_changed',jsonb_build_object('to_stage_id',p_to_stage_id,'comment',p_comment));
  return c;
end;
$$;
revoke all on function public.transition_case_stage(uuid,uuid,text) from public;
grant execute on function public.transition_case_stage(uuid,uuid,text) to authenticated;

-- Restrict finance changes to management. Payment rows intentionally have no UPDATE/DELETE policy.
drop policy if exists "finance managers write" on public.case_finances;
create policy "finance managers insert" on public.case_finances for insert to authenticated
with check(public.can_manage_cases());
create policy "finance managers update" on public.case_finances for update to authenticated
using(public.can_manage_cases()) with check(public.can_manage_cases());

-- Ensure payment currency matches the case's agreed currency when finance exists.
create or replace function public.validate_payment_currency()
returns trigger language plpgsql set search_path=public
as $$
declare c public.money_currency;
begin
  select currency into c from public.case_finances where case_id=new.case_id;
  if c is not null and c <> new.currency then
    raise exception 'Payment currency must match case finance currency';
  end if;
  return new;
end;
$$;
drop trigger if exists payments_validate_currency on public.payments;
create trigger payments_validate_currency before insert or update of case_id,currency
on public.payments for each row execute procedure public.validate_payment_currency();

-- Keep the activity trail append-only for authenticated users.
revoke update,delete,truncate on public.activity_logs from authenticated;
revoke update,delete,truncate on public.case_stage_history from authenticated;
revoke update,delete,truncate on public.payments from authenticated;

-- Private bucket for case documents. Object path format: <case-uuid>/<filename>.
insert into storage.buckets(id,name,public,file_size_limit)
values('visa-case-documents','visa-case-documents',false,20971520)
on conflict(id) do update set public=false,file_size_limit=20971520;

create policy "visa documents read authorized case users"
on storage.objects for select to authenticated
using(bucket_id='visa-case-documents' and exists(
  select 1 from public.visa_cases c
  where c.id::text=(storage.foldername(name))[1]
  and (c.created_by=auth.uid() or c.assigned_to=auth.uid() or public.can_manage_cases())
));

create policy "visa documents upload authorized case users"
on storage.objects for insert to authenticated
with check(bucket_id='visa-case-documents' and exists(
  select 1 from public.visa_cases c
  where c.id::text=(storage.foldername(name))[1]
  and (c.created_by=auth.uid() or c.assigned_to=auth.uid() or public.can_manage_cases())
));

create policy "visa documents update authorized case users"
on storage.objects for update to authenticated
using(bucket_id='visa-case-documents' and exists(
  select 1 from public.visa_cases c
  where c.id::text=(storage.foldername(name))[1]
  and (c.created_by=auth.uid() or c.assigned_to=auth.uid() or public.can_manage_cases())
))
with check(bucket_id='visa-case-documents' and exists(
  select 1 from public.visa_cases c
  where c.id::text=(storage.foldername(name))[1]
  and (c.created_by=auth.uid() or c.assigned_to=auth.uid() or public.can_manage_cases())
));
