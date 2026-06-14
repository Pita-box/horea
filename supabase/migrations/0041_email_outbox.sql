-- Email outbox — fronta pro retry best-effort e-mailů (notifikace rezervací,
-- faktury, admin), které selhaly přechodnou chybou (quota/429, 5xx, síť).
-- Cron /api/cron/email-retry je dožene s exponenciálním backoffem.
-- Obsahuje PII (příjemce + tělo) → přístup jen service_role; staré řádky se promazávají.

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('reservation_notification', 'invoice', 'admin')),
  provider text not null check (provider in ('smtp2go', 'resend')),
  to_email text not null,
  reply_to text,
  subject text not null,
  html_body text,
  text_body text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'dead')),
  attempts integer not null default 0,
  max_attempts integer not null default 6,
  next_attempt_at timestamptz not null default now(),
  last_error_code text,
  ref_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- Index pro výběr splatných řádků cronem (status='pending' řazené dle next_attempt_at).
create index if not exists email_outbox_due_idx
  on public.email_outbox (next_attempt_at)
  where status = 'pending';

-- Index pro promazávání starých vyřízených řádků.
create index if not exists email_outbox_created_idx
  on public.email_outbox (created_at);

-- RLS: bez policy = deny-all pro anon/authenticated; přístup má jen service_role
-- (bypassuje RLS) ze server-only kódu.
alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from anon, authenticated;
