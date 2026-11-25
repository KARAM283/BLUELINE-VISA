-- Store passport identity fields populated by Gemini OCR.
alter table public.visa_cases
  add column if not exists customer_first_name text,
  add column if not exists customer_last_name text,
  add column if not exists passport_number text,
  add column if not exists nationality text,
  add column if not exists passport_issue_date date;
