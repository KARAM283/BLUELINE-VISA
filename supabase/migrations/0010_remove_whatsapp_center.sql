-- Retire the WhatsApp Center module. No user data existed when this cleanup was prepared.
drop table if exists public.whatsapp_campaign_recipients cascade;
drop table if exists public.whatsapp_messages cascade;
drop table if exists public.whatsapp_conversations cascade;
drop table if exists public.whatsapp_campaigns cascade;
drop table if exists public.whatsapp_templates cascade;
drop table if exists public.whatsapp_webhook_events cascade;
drop table if exists public.whatsapp_contacts cascade;
