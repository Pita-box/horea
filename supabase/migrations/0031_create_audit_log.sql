-- Migrace 0031: tabulka auditní stopy citlivých administrátorských akcí
-- (feature `admin-dashboard`, Audit_Log, task 1.1).
--
-- `audit_log` je NOVÁ entita zaváděná admin dashboardem. Uchovává jeden záznam
-- pro každou citlivou akci provozovatele platformy (override / úprava
-- předplatného, udělení free trial / comp, pozastavení podniku, vynucené
-- smazání podniku, CRUD kupónu, spárování platby) — viz Requirement 9.
--
-- Zápis záznamu probíhá ve stejné transakci jako samotná akce (atomicita,
-- Property 2). Zachycení `before`/`after` je best-effort: pokud se kontext
-- nepodaří zachytit, oba sloupce zůstanou `null` a akce kvůli tomu nesmí padnout
-- (R9.4) — proto jsou oba nullable.
--
-- POZN.: append-only vynucení na úrovni DB (REVOKE UPDATE/DELETE + RLS jen
-- INSERT/SELECT) řeší SAMOSTATNÁ migrace v rámci tasku 1.2 — zde se NEŘEŠÍ.
-- _Requirements: 9.1, 9.2, 9.3_

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id) on delete set null,
  action_type text not null,
  target_type text not null,
  target_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

comment on table public.audit_log is
  'Append-only auditní stopa citlivých administrátorských akcí (feature admin-dashboard, R9). Jeden záznam na úspěšnou citlivou akci, zapsaný ve stejné transakci jako akce. Append-only se vynucuje samostatně na úrovni DB (task 1.2).';
comment on column public.audit_log.actor_user_id is
  'Administrátor (users.id), který akci provedl. on delete set null zachová záznam i po případném odstranění uživatele.';
comment on column public.audit_log.action_type is
  'Typ akce, např. subscription_override, grant_free_trial, grant_comp, suspend_business, force_delete_business, coupon_create/update/deactivate/delete, payment_match.';
comment on column public.audit_log.target_type is
  'Typ cílového objektu, např. subscription, business, coupon, payment.';
comment on column public.audit_log.before is
  'Stav cílového objektu před akcí; null u akcí vytvářejících objekt nebo když se kontext nepodaří zachytit (R9.4).';
comment on column public.audit_log.after is
  'Stav cílového objektu po akci; null za stejných podmínek jako before (R9.4).';

-- Sestupné čtení podle času (R10.1 — výchozí zobrazení audit logu nejnovější nahoře).
create index audit_log_created_at_idx on public.audit_log (created_at desc);

-- Filtrování záznamů podle cílového objektu (R10.4).
create index audit_log_target_id_idx on public.audit_log (target_id);
