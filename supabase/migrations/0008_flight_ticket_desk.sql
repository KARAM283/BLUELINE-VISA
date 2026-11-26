create table if not exists public.flight_pipelines (
 id uuid primary key default gen_random_uuid(),
 company_key text not null check (company_key in ('blue_line','ctw')),
 name text not null,
 sort_order integer not null default 0,
 created_by uuid references auth.users(id) on delete set null default auth.uid(),
 created_at timestamptz not null default now()
);
create index if not exists flight_pipelines_company_order_idx on public.flight_pipelines(company_key,sort_order,created_at);
create table if not exists public.flight_tickets (
 id uuid primary key default gen_random_uuid(),
 company_key text not null check (company_key in ('blue_line','ctw')),
 pipeline_id uuid not null references public.flight_pipelines(id) on delete restrict,
 passenger_name text, ticket_number text, booking_reference text, airline text, origin text, destination text,
 departure_date date, departure_time time, arrival_date date, arrival_time time,
 segments jsonb not null default '[]'::jsonb, passengers jsonb not null default '[]'::jsonb,
 ticket_type text, document_path text, original_file_name text,
 created_by uuid references auth.users(id) on delete set null default auth.uid(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists flight_tickets_company_created_idx on public.flight_tickets(company_key,created_at desc);
create index if not exists flight_tickets_pipeline_created_idx on public.flight_tickets(pipeline_id,created_at desc);
create index if not exists flight_tickets_departure_idx on public.flight_tickets(company_key,departure_date);
alter table public.flight_pipelines enable row level security;
alter table public.flight_tickets enable row level security;
drop policy if exists "Authenticated staff manage flight pipelines" on public.flight_pipelines;
create policy "Authenticated staff manage flight pipelines" on public.flight_pipelines for all to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
drop policy if exists "Authenticated staff manage flight tickets" on public.flight_tickets;
create policy "Authenticated staff manage flight tickets" on public.flight_tickets for all to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
grant select,insert,update,delete on public.flight_pipelines to authenticated;
grant select,insert,update,delete on public.flight_tickets to authenticated;
insert into public.flight_pipelines(company_key,name,sort_order)
select b.company_key,s.name,s.sort_order from (values ('blue_line'),('ctw')) b(company_key)
cross join (values ('New Tickets',0),('Upcoming',1),('Travelled',2),('Cancelled',3)) s(name,sort_order)
where not exists(select 1 from public.flight_pipelines p where p.company_key=b.company_key and lower(p.name)=lower(s.name));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('flight-tickets','flight-tickets',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Authenticated staff access flight ticket files" on storage.objects;
create policy "Authenticated staff access flight ticket files" on storage.objects for all to authenticated using(bucket_id='flight-tickets') with check(bucket_id='flight-tickets');

create or replace function public.enforce_flight_ticket_pipeline_company()
returns trigger
language plpgsql
set search_path = ''
as $$
declare pipeline_company text;
begin
  select p.company_key into pipeline_company
  from public.flight_pipelines p
  where p.id = new.pipeline_id;
  if pipeline_company is null or pipeline_company <> new.company_key then
    raise exception 'Flight ticket company must match its pipeline';
  end if;
  return new;
end;
$$;
drop trigger if exists flight_ticket_pipeline_company_guard on public.flight_tickets;
create trigger flight_ticket_pipeline_company_guard
before insert or update of company_key, pipeline_id on public.flight_tickets
for each row execute function public.enforce_flight_ticket_pipeline_company();