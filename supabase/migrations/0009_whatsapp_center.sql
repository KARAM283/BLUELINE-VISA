-- WhatsApp Center: unified inbox, campaigns, contacts, templates and analytics data.
create extension if not exists pgcrypto;
create table if not exists public.whatsapp_contacts (
 id uuid primary key default gen_random_uuid(), phone_e164 text not null unique,
 display_name text, profile_name text, individual_customer_id uuid references public.individual_customers(id) on delete set null,
 company_id uuid references public.companies(id) on delete set null,
 consent_status text not null default 'unknown' check(consent_status in ('unknown','opted_in','opted_out')),
 consent_source text, consent_at timestamptz, last_inbound_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.whatsapp_conversations (
 id uuid primary key default gen_random_uuid(), contact_id uuid not null references public.whatsapp_contacts(id) on delete cascade,
 status text not null default 'open' check(status in ('open','pending','resolved','archived')),
 assigned_to uuid references public.profiles(id) on delete set null,
 priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
 subject text, labels text[] not null default '{}', unread_count integer not null default 0 check(unread_count>=0),
 last_message_at timestamptz, last_message_preview text, window_expires_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.whatsapp_messages (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
 contact_id uuid not null references public.whatsapp_contacts(id) on delete cascade, provider_message_id text unique,
 direction text not null check(direction in ('inbound','outbound')), message_type text not null default 'text',
 body text, media_id text, media_mime_type text, media_file_name text, media_storage_path text,
 template_name text, template_language text, status text not null default 'received' check(status in ('received','queued','sent','delivered','read','failed')),
 error_code text, error_message text, context jsonb not null default '{}',
 sent_by uuid references public.profiles(id) on delete set null, occurred_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create table if not exists public.whatsapp_campaigns (
 id uuid primary key default gen_random_uuid(), name text not null, description text,
 status text not null default 'draft' check(status in ('draft','scheduled','processing','completed','paused','cancelled','failed')),
 message_type text not null default 'template' check(message_type in ('template')), template_name text not null,
 template_language text not null default 'en', template_components jsonb not null default '[]',
 audience_filter jsonb not null default '{"consent_status":"opted_in"}', scheduled_at timestamptz, started_at timestamptz, completed_at timestamptz,
 created_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.whatsapp_campaign_recipients (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.whatsapp_campaigns(id) on delete cascade,
 contact_id uuid not null references public.whatsapp_contacts(id) on delete cascade, phone_e164 text not null,
 status text not null default 'queued' check(status in ('queued','sent','delivered','read','failed','skipped')),
 provider_message_id text unique, error_code text, error_message text, sent_at timestamptz, delivered_at timestamptz, read_at timestamptz,
 created_at timestamptz not null default now(), unique(campaign_id,contact_id)
);
create table if not exists public.whatsapp_templates (
 id uuid primary key default gen_random_uuid(), meta_template_id text, name text not null unique, language text not null default 'en',
 category text, status text not null default 'unknown', components jsonb not null default '[]', last_synced_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.whatsapp_templates drop constraint if exists whatsapp_templates_name_key;
alter table public.whatsapp_templates add constraint whatsapp_templates_name_language_key unique(name, language);
create table if not exists public.whatsapp_webhook_events (
 id bigint generated always as identity primary key, event_key text unique, event_type text not null, payload jsonb not null,
 processed_at timestamptz, error_message text, created_at timestamptz not null default now()
);
create index if not exists whatsapp_conversations_status_last_idx on public.whatsapp_conversations(status,last_message_at desc);
create index if not exists whatsapp_conversations_assignee_idx on public.whatsapp_conversations(assigned_to,last_message_at desc);
create index if not exists whatsapp_messages_conversation_time_idx on public.whatsapp_messages(conversation_id,occurred_at desc);
create index if not exists whatsapp_campaign_recipients_campaign_status_idx on public.whatsapp_campaign_recipients(campaign_id,status);
create index if not exists whatsapp_contacts_consent_idx on public.whatsapp_contacts(consent_status,created_at desc);
alter table public.whatsapp_contacts enable row level security;
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_campaigns enable row level security;
alter table public.whatsapp_campaign_recipients enable row level security;
alter table public.whatsapp_templates enable row level security;
alter table public.whatsapp_webhook_events enable row level security;
create policy "Authenticated staff can manage WhatsApp contacts" on public.whatsapp_contacts for all to authenticated using(true) with check(true);
create policy "Authenticated staff can manage WhatsApp conversations" on public.whatsapp_conversations for all to authenticated using(true) with check(true);
create policy "Authenticated staff can manage WhatsApp messages" on public.whatsapp_messages for all to authenticated using(true) with check(true);
create policy "Authenticated staff can manage WhatsApp campaigns" on public.whatsapp_campaigns for all to authenticated using(true) with check(true);
create policy "Authenticated staff can manage WhatsApp campaign recipients" on public.whatsapp_campaign_recipients for all to authenticated using(true) with check(true);
create policy "Authenticated staff can manage WhatsApp templates" on public.whatsapp_templates for all to authenticated using(true) with check(true);
revoke all on public.whatsapp_webhook_events from anon, authenticated;
grant all on public.whatsapp_webhook_events to service_role;
grant select,insert,update,delete on public.whatsapp_contacts,public.whatsapp_conversations,public.whatsapp_messages,public.whatsapp_campaigns,public.whatsapp_campaign_recipients,public.whatsapp_templates to authenticated;
grant all on public.whatsapp_contacts,public.whatsapp_conversations,public.whatsapp_messages,public.whatsapp_campaigns,public.whatsapp_campaign_recipients,public.whatsapp_templates to service_role;
