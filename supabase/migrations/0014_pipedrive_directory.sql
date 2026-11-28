create table if not exists public.pipedrive_settings (
  id boolean primary key default true check (id = true),
  api_token text not null,
  company_name text,
  company_domain text,
  is_connected boolean not null default false,
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz,
  synced_people_count integer not null default 0,
  synced_organization_count integer not null default 0
);
alter table public.pipedrive_settings add column if not exists last_synced_at timestamptz;
alter table public.pipedrive_settings add column if not exists synced_people_count integer not null default 0;
alter table public.pipedrive_settings add column if not exists synced_organization_count integer not null default 0;
alter table public.pipedrive_settings enable row level security;
revoke all on public.pipedrive_settings from anon, authenticated;

create table if not exists public.pipedrive_organizations (
  external_id text primary key,
  name text not null,
  phone text,
  address text,
  website text,
  raw_data jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);
create table if not exists public.pipedrive_people (
  external_id text primary key,
  name text not null,
  first_name text,
  last_name text,
  phone text,
  email text,
  organization_external_id text,
  organization_name text,
  raw_data jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);
alter table public.pipedrive_organizations enable row level security;
alter table public.pipedrive_people enable row level security;
grant select on public.pipedrive_organizations, public.pipedrive_people to authenticated;
drop policy if exists "Managers can read Pipedrive organizations" on public.pipedrive_organizations;
create policy "Managers can read Pipedrive organizations" on public.pipedrive_organizations for select to authenticated
using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role in ('admin','manager')));
drop policy if exists "Managers can read Pipedrive people" on public.pipedrive_people;
create policy "Managers can read Pipedrive people" on public.pipedrive_people for select to authenticated
using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role in ('admin','manager')));
