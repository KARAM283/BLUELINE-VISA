# Blue Line Visa Pipeline

An internal visa-case workflow platform for Blue Line Travel. This repository is independent from all HR and other Blue Line systems.

## Product decisions

- Scope: all countries and visa categories.
- Views: Kanban board and table view.
- Access: role-based access control (RBAC).
- Case ownership: employees create and manage their own cases; management roles have broader access according to policy.
- Customer records: each visa application is an independent case file. A person may have multiple separate cases.
- Documents: private Supabase Storage bucket.
- Workflow: configurable stages, stage history, tasks, overdue tracking, notifications, and WhatsApp integration hooks.
- Finance: basic agreed fees, paid and remaining amounts, IQD/USD, and payment history.

## Planned architecture

- Frontend: React, TypeScript, Tailwind CSS.
- Backend: Cloudflare Workers.
- Data/auth/files: a dedicated Supabase project (PostgreSQL, Auth, Storage, RLS).
- Automation: scheduled Worker/Cron tasks and WhatsApp Business Cloud API.

## Repository boundaries

This project must use its own GitHub repository, Supabase project, Cloudflare Worker, credentials, and environment variables. Do not connect it to or reuse HR infrastructure. Never commit secrets, service-role keys, access tokens, customer passport data, or real customer documents.

## Current status

This is the foundation stage. Database migrations are design drafts and must be reviewed and tested on a new, isolated Supabase project before production use. No production deployment or real customer data is authorized by this repository setup alone.

## Database setup

1. Create a new Supabase project dedicated to Visa Pipeline.
2. Review the SQL files in supabase/migrations/.
3. Apply migrations in filename order using the Supabase CLI or SQL Editor.
4. Run the smoke checks in supabase/tests/.
5. Verify RLS isolation with at least two ordinary employee accounts and one manager/admin account.
6. Verify private Storage access and signed URL behavior before uploading any real documents.
7. Do not use the existing HR Supabase project.

## Environment

Copy .env.example to a local .env and fill only the values needed for the relevant environment. Keep .env out of version control. The Supabase service-role key and all provider tokens must remain server-side.

## Initial admin bootstrap

After creating the first authenticated user in the dedicated Supabase project, assign the admin role using the reviewed administrative bootstrap procedure. Do not expose privileged role assignment through a public client route.

## Next implementation milestones

1. Review and validate database migrations.
2. Create isolated Supabase and Cloudflare resources.
3. Implement authentication, profiles, roles, and permission-aware navigation.
4. Implement case creation, independent case files, document requirements, and private uploads.
5. Implement Kanban/table workflows, stage transitions, history, tasks, and overdue notifications.
6. Implement basic finance and payment history.
7. Add WhatsApp integration with explicit consent and server-side secrets.
8. Add automated tests, deployment workflow, backups, and operational documentation.
