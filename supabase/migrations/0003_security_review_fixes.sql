-- Security and integrity corrections identified during repository review.
-- Apply only after reviewing against the target Supabase/Postgres version.

-- 1) The finance view must obey the caller's RLS policies on underlying tables.
create or replace view public.case_finance_summary
with (security_invoker = true)
as
select f.case_id, f.agreed_fee, f.currency,
       coalesce(sum(p.amount) filter (where p.currency=f.currency),0)::numeric(14,2) as paid_amount,
       (f.agreed_fee-coalesce(sum(p.amount) filter (where p.currency=f.currency),0))::numeric(14,2) as remaining_amount
from public.case_finances f
left join public.payments p on p.case_id=f.case_id
group by f.case_id,f.agreed_fee,f.currency;

-- 2) The sequence/counter is an internal implementation detail, not an API table.
alter table public.case_number_counters enable row level security;
revoke all on public.case_number_counters from anon, authenticated;

-- 3) Lock down trigger/helper functions. Trigger execution does not require callers
-- to have direct EXECUTE privileges on the trigger function.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.assign_case_number() from public, anon, authenticated;
revoke all on function public.validate_case_configuration() from public, anon, authenticated;
revoke all on function public.validate_payment_currency() from public, anon, authenticated;
revoke all on function public.has_role(public.app_role) from public, anon;
revoke all on function public.can_manage_cases() from public, anon;
grant execute on function public.has_role(public.app_role) to authenticated;
grant execute on function public.can_manage_cases() to authenticated;

-- 4) A case creator cannot be rewritten. Ordinary employees cannot reassign
-- a case to another employee; managers/admins can manage assignment.
create or replace function public.guard_case_identity_and_assignment()
returns trigger language plpgsql set search_path=public
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'Case creator is immutable';
  end if;
  if new.case_number is distinct from old.case_number then
    raise exception 'Case number is immutable';
  end if;
  if not public.can_manage_cases()
     and new.assigned_to is distinct from old.assigned_to then
    raise exception 'Only managers can reassign a case';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_case_identity_and_assignment() from public, anon, authenticated;
drop trigger if exists visa_cases_guard_identity_assignment on public.visa_cases;
create trigger visa_cases_guard_identity_assignment
before update on public.visa_cases
for each row execute procedure public.guard_case_identity_and_assignment();

drop policy if exists "cases create self" on public.visa_cases;
create policy "cases create self or manager" on public.visa_cases
for insert to authenticated
with check (
  (created_by=auth.uid() and (assigned_to is null or assigned_to=auth.uid()))
  or public.can_manage_cases()
);

-- 5) Stage changes are only allowed through transition_case_stage().
create or replace function public.guard_case_stage_transition()
returns trigger language plpgsql set search_path=public
as $$
begin
  if new.current_stage_id is distinct from old.current_stage_id
     and coalesce(current_setting('app.allow_stage_transition',true),'off') <> 'on' then
    raise exception 'Use transition_case_stage() to change the case stage';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_case_stage_transition() from public, anon, authenticated;
drop trigger if exists visa_cases_guard_stage_transition on public.visa_cases;
create trigger visa_cases_guard_stage_transition
before update of current_stage_id on public.visa_cases
for each row execute procedure public.guard_case_stage_transition();

create or replace function public.transition_case_stage(p_case_id uuid,p_to_stage_id uuid,p_comment text default null)
returns public.visa_cases
language plpgsql security definer set search_path=public
as $$
declare c public.visa_cases; s public.workflow_stages;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into c from public.visa_cases where id=p_case_id for update;
  if not found then raise exception 'Case not found'; end if;
  if not (c.created_by=auth.uid() or c.assigned_to=auth.uid() or public.can_manage_cases()) then
    raise exception 'Not authorized to transition this case';
  end if;

  select * into s from public.workflow_stages
  where id=p_to_stage_id and workflow_id=c.workflow_id;
  if not found then raise exception 'Target stage is not part of this case workflow'; end if;
  if c.current_stage_id=p_to_stage_id then return c; end if;

  insert into public.case_stage_history(case_id,from_stage_id,to_stage_id,changed_by,comment)
  values(c.id,c.current_stage_id,p_to_stage_id,auth.uid(),p_comment);

  perform set_config('app.allow_stage_transition','on',true);
  update public.visa_cases
  set current_stage_id=p_to_stage_id,
      updated_at=now(),
      status=case when s.is_terminal then 'completed' else status end,
      closed_at=case when s.is_terminal then now() else closed_at end
  where id=p_case_id returning * into c;
  perform set_config('app.allow_stage_transition','off',true);

  insert into public.activity_logs(actor_id,case_id,action,details)
  values(auth.uid(),p_case_id,'case.stage_changed',
         jsonb_build_object('to_stage_id',p_to_stage_id,'comment',p_comment));
  return c;
end;
$$;
revoke all on function public.transition_case_stage(uuid,uuid,text) from public, anon;
grant execute on function public.transition_case_stage(uuid,uuid,text) to authenticated;

-- Do not allow clients to forge history rows outside the transition RPC.
drop policy if exists "case related insert through access" on public.case_stage_history;
revoke insert,update,delete on public.case_stage_history from anon, authenticated;

-- Managers can review/update document metadata after upload.
create policy "case documents manager review" on public.case_documents
for update to authenticated
using(public.can_manage_cases())
with check(public.can_manage_cases());

-- Add supporting indexes for common case and payment lookups.
create index if not exists payments_case_paid_at_idx on public.payments(case_id,paid_at desc);
create index if not exists case_documents_case_uploaded_idx on public.case_documents(case_id,uploaded_at desc);
