# Blue Line Visa Pipeline

Internal visa operations application for Blue Line Travel. This repository and its dedicated Supabase project are independent from all HR systems.

## Stack
- React + TypeScript + Vite
- Tailwind CSS
- Supabase Auth, PostgreSQL, RLS and private Storage
- Cloudflare deployment planned

## Local development
1. `npm install`
2. Copy `.env.example` to `.env`.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the dedicated Visa Pipeline Supabase project.
4. `npm run dev`

## Build
- `npm run typecheck`
- `npm run build`

## Current implementation
- Email/password sign-in through Supabase Auth (no public registration route).
- Role-aware shell for employee, manager and admin.
- Dashboard metrics and recent case list.
- Case list search.
- Standalone VISA pipelines with drag-and-drop application transfers between pipelines.
- New case creation using configured country, visa type, and a selected pipeline.

## Important security notes
- Never put a Supabase service-role key in Vite variables or browser code.
- Create staff accounts through a trusted Supabase admin process.
- Assign the initial admin role only through a trusted SQL/admin procedure after confirming the correct user UUID.
- Do not upload real passport documents until RLS and private Storage access have been tested with separate employee accounts.
- This project must not share credentials, databases, buckets, or deployment resources with HR systems.
