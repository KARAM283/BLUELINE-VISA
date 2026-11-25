-- Blue Line Visa Pipeline foundation schema.
-- Draft migration: review and test on a dedicated Supabase project before production.
create extension if not exists pgcrypto;

create type public.app_role as enum ('employee','manager','admin');
create type public.money_currency as enum ('IQD','USD');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  primary key(user_id, role)
);

create table public.countries (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  iso2 char(2) unique,
  is_active boolean not null default true
);

create table public.visa_types (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id),
  name text not null,
  description text,
  is_active boolean not null default true,
  unique(country_id,name),
  unique(id,country_id)
);

create table public.workflow_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country_id uuid references public.countries(id),
  visa_type_id uuid references public.visa_types(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.workflow_stages (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflow_templates(id) on delete cascade,
  name text not null,
  position integer not null check(position >= 0),
  is_terminal boolean not null default false,
  unique(workflow_id,position),
  unique(id,workflow_id)
);

create table public.visa_cases (
  id uuid primary key default gen_random_uuid(),
  case_number text unique,
  created_by uuid not null references public.profiles(id),
  assigned_to uuid references public.profiles(id),
  customer_full_name text not null,
  customer_phone text,
  customer_email text,
  country_id uuid not null references public.countries(id),
  visa_type_id uuid not null,
  workflow_id uuid not null references public.workflow_templates(id),
  current_stage_id uuid not null,
  status text not null default 'open' check(status in ('open','on_hold','completed','cancelled')),
  priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
  opened_at timestamptz not null default now(),
  due_at timestamptz,
  closed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(visa_type_id,country_id) references public.visa_types(id,country_id),
  foreign key(current_stage_id,workflow_id) references public.workflow_stages(id,workflow_id),
  foreign key(workflow_id) references public.workflow_templates(id)
);

create table public.case_stage_history (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.visa_cases(id) on delete cascade,
  from_stage_id uuid references public.workflow_stages(id),
  to_stage_id uuid not null references public.workflow_stages(id),
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now(),
  comment text
);

create table public.document_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true
);

create table public.document_requirements (
  id uuid primary key default gen_random_uuid(),
  visa_type_id uuid not null references public.visa_types(id) on delete cascade,
  document_type_id uuid not null references public.document_types(id),
  is_required boolean not null default true,
  instructions text,
  unique(visa_type_id,document_type_id)
);

create table public.case_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.visa_cases(id) on delete cascade,
  document_type_id uuid references public.document_types(id),
  storage_path text not null unique,
  original_filename text not null,
  mime_type text,
  uploaded_by uuid not null references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  review_status text not null default 'pending' check(review_status in ('pending','approved','rejected')),
  review_note text
);

create table public.case_notes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.visa_cases(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.visa_cases(id) on delete cascade,
  title text not null,
  description text,
  assigned_to uuid references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  due_at timestamptz,
  completed_at timestamptz,
  priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
  created_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.visa_cases(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check(ends_at is null or ends_at >= starts_at)
);

create table public.case_finances (
  case_id uuid primary key references public.visa_cases(id) on delete cascade,
  agreed_fee numeric(14,2) not null default 0 check(agreed_fee >= 0),
  currency public.money_currency not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.visa_cases(id) on delete restrict,
  amount numeric(14,2) not null check(amount > 0),
  currency public.money_currency not null,
  paid_at timestamptz not null default now(),
  method text,
  reference text,
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create view public.case_finance_summary as
select f.case_id, f.agreed_fee, f.currency,
       coalesce(sum(p.amount) filter (where p.currency=f.currency),0)::numeric(14,2) as paid_amount,
       (f.agreed_fee-coalesce(sum(p.amount) filter (where p.currency=f.currency),0))::numeric(14,2) as remaining_amount
from public.case_finances f left join public.payments p on p.case_id=f.case_id
group by f.case_id,f.agreed_fee,f.currency;

create table public.sla_rules (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references public.workflow_templates(id) on delete cascade,
  stage_id uuid references public.workflow_stages(id) on delete cascade,
  duration_hours integer not null check(duration_hours > 0),
  is_active boolean not null default true
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  case_id uuid references public.visa_cases(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.activity_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  case_id uuid references public.visa_cases(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  channel text not null check(channel in ('whatsapp')),
  template_body text not null,
  is_active boolean not null default true
);

create table public.message_queue (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.visa_cases(id) on delete cascade,
  recipient text not null,
  template_id uuid references public.message_templates(id),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check(status in ('queued','sent','failed','cancelled')),
  attempts integer not null default 0,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index visa_cases_owner_idx on public.visa_cases(created_by);
create index visa_cases_assignee_idx on public.visa_cases(assigned_to);
create index visa_cases_stage_idx on public.visa_cases(current_stage_id);
create index visa_cases_due_idx on public.visa_cases(due_at) where status='open';
create index case_history_case_time_idx on public.case_stage_history(case_id,changed_at desc);
create index tasks_assignee_due_idx on public.tasks(assigned_to,due_at);
create index notifications_user_unread_idx on public.notifications(user_id,created_at desc) where read_at is null;

-- Auth profile bootstrap.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.profiles(id,full_name)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''));
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.has_role(required_role public.app_role)
returns boolean language sql stable security definer set search_path=public
as $$
  select exists(select 1 from public.user_roles where user_id=auth.uid() and role=required_role);
$$;

create or replace function public.can_manage_cases()
returns boolean language sql stable security definer set search_path=public
as $$
  select public.has_role('admin') or public.has_role('manager');
$$;

-- Enable RLS on all application tables.
do $$
declare t text;
begin
  foreach t in array array['profiles','user_roles','countries','visa_types','workflow_templates','workflow_stages','visa_cases','case_stage_history','document_types','document_requirements','case_documents','case_notes','tasks','appointments','case_finances','payments','sla_rules','notifications','activity_logs','message_templates','message_queue']
  loop execute format('alter table public.%I enable row level security',t); end loop;
end $$;

create policy "profiles read self or managers" on public.profiles for select to authenticated
using(id=auth.uid() or public.can_manage_cases());
create policy "profiles update self" on public.profiles for update to authenticated
using(id=auth.uid()) with check(id=auth.uid());
create policy "roles read self or managers" on public.user_roles for select to authenticated
using(user_id=auth.uid() or public.can_manage_cases());
create policy "roles admin manage" on public.user_roles for all to authenticated
using(public.has_role('admin')) with check(public.has_role('admin'));

create policy "cases read owner assignee or manager" on public.visa_cases for select to authenticated
using(created_by=auth.uid() or assigned_to=auth.uid() or public.can_manage_cases());
create policy "cases create self" on public.visa_cases for insert to authenticated
with check(created_by=auth.uid());
create policy "cases update owner assignee or manager" on public.visa_cases for update to authenticated
using(created_by=auth.uid() or assigned_to=auth.uid() or public.can_manage_cases())
with check(created_by=auth.uid() or assigned_to=auth.uid() or public.can_manage_cases());

create policy "case related read through access" on public.case_stage_history for select to authenticated
using(exists(select 1 from public.visa_cases c where c.id=case_id and (c.created_by=auth.uid() or c.assigned_to=auth.uid() or public.can_manage_cases())));
create policy "case related insert through access" on public.case_stage_history for insert to authenticated
with check(changed_by=auth.uid() and exists(select 1 from public.visa_cases c where c.id=case_id and (c.created_by=auth.uid() or c.assigned_to=auth.uid() or public.can_manage_cases())));

create policy "case documents access" on public.case_documents for select to authenticated
using(exists(select 1 from public.visa_cases c where c.id=case_id and (c.created_by=auth.uid() or c.assigned_to=auth.uid() or public.can_manage_cases())));
create policy "case documents upload" on public.case_documents for insert to authenticated
with check(uploaded_by=auth.uid() and exists(select 1 from public.visa_cases c where c.id=case_id and (c.created_by=auth.uid() or c.assigned_to=auth.uid() or public.can_manage_cases())));

create policy "case notes access" on public.case_notes for select to authenticated
using(exists(select 1 from public.visa_cases c where c.id=case_id and (c.created_by=auth.uid() or c.assigned_to=auth.uid() or public.can_manage_cases())));
create policy "case notes add" on public.case_notes for insert to authenticated
with check(author_id=auth.uid() and exists(select 1 from public.visa_cases c where c.id=case_id and (c.created_by=auth.uid() or c.assigned_to=auth.uid() or public.can_manage_cases())));

create policy "tasks access" on public.tasks for select to authenticated
using(created_by=auth.uid() or assigned_to=auth.uid() or public.can_manage_cases());
create policy "tasks create" on public.tasks for insert to authenticated
with check(created_by=auth.uid());
create policy "tasks update" on public.tasks for update to authenticated
using(created_by=auth.uid() or assigned_to=auth.uid() or public.can_manage_cases())
with check(created_by=auth.uid() or assigned_to=auth.uid() or public.can_manage_cases());

create policy "appointments access" on public.appointments for select to authenticated
using(exists(select 1 from public.visa_cases c where c.id=case_id and (c.created_by=auth.uid() or c.assigned_to=auth.uid() or public.can_manage_cases())));
create policy "appointments create" on public.appointments for insert to authenticated
with check(created_by=auth.uid() and exists(select 1 from public.visa_cases c where c.id=case_id and (c.created_by=auth.uid() or c.assigned_to=auth.uid() or public.can_manage_cases())));

create policy "finance read authorized" on public.case_finances for select to authenticated
using(public.can_manage_cases() or exists(select 1 from public.visa_cases c where c.id=case_id and (c.created_by=auth.uid() or c.assigned_to=auth.uid())));
create policy "finance managers write" on public.case_finances for all to authenticated
using(public.can_manage_cases()) with check(public.can_manage_cases());
create policy "payments read authorized" on public.payments for select to authenticated
using(public.can_manage_cases() or exists(select 1 from public.visa_cases c where c.id=case_id and (c.created_by=auth.uid() or c.assigned_to=auth.uid())));
create policy "payments managers insert" on public.payments for insert to authenticated
with check(recorded_by=auth.uid() and public.can_manage_cases());

create policy "notifications own" on public.notifications for all to authenticated
using(user_id=auth.uid()) with check(user_id=auth.uid());

-- Reference data is readable to authenticated users; management controls edits.
create policy "countries read" on public.countries for select to authenticated using(true);
create policy "countries managers manage" on public.countries for all to authenticated using(public.can_manage_cases()) with check(public.can_manage_cases());
create policy "visa types read" on public.visa_types for select to authenticated using(true);
create policy "visa types managers manage" on public.visa_types for all to authenticated using(public.can_manage_cases()) with check(public.can_manage_cases());
create policy "workflows read" on public.workflow_templates for select to authenticated using(true);
create policy "workflows managers manage" on public.workflow_templates for all to authenticated using(public.can_manage_cases()) with check(public.can_manage_cases());
create policy "stages read" on public.workflow_stages for select to authenticated using(true);
create policy "stages managers manage" on public.workflow_stages for all to authenticated using(public.can_manage_cases()) with check(public.can_manage_cases());
create policy "document types read" on public.document_types for select to authenticated using(true);
create policy "document types managers manage" on public.document_types for all to authenticated using(public.can_manage_cases()) with check(public.can_manage_cases());
create policy "document requirements read" on public.document_requirements for select to authenticated using(true);
create policy "document requirements managers manage" on public.document_requirements for all to authenticated using(public.can_manage_cases()) with check(public.can_manage_cases());
create policy "sla managers manage" on public.sla_rules for all to authenticated using(public.can_manage_cases()) with check(public.can_manage_cases());
create policy "templates managers manage" on public.message_templates for all to authenticated using(public.can_manage_cases()) with check(public.can_manage_cases());
create policy "queue managers manage" on public.message_queue for all to authenticated using(public.can_manage_cases()) with check(public.can_manage_cases());

-- Activity log is readable by managers; inserts are attributed to the current user.
create policy "activity managers read" on public.activity_logs for select to authenticated using(public.can_manage_cases());
create policy "activity insert self" on public.activity_logs for insert to authenticated with check(actor_id=auth.uid());
