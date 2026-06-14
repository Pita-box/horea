-- Migrace 0035: sdílená funkce pro zápis auditního záznamu ve stejné transakci
-- jako citlivá akce (feature `admin-dashboard`, AuditLogger, task 3.1).
--
-- PROČ RPC, NE TS INSERT: Supabase JS klient neumí držet jednu DB transakci přes
-- více volání (stejná lekce jako migrace 0021/0027/0030). Aby audit a samotná
-- citlivá akce stály a padaly SPOLEČNĚ (design.md, *Audit logging strategy*;
-- Property 2 — právě jeden záznam na úspěšnou akci), musí zápis auditu probíhat
-- UVNITŘ téže transakce jako akce. Tato funkce je proto primitiv, který akční
-- RPC (override předplatného, free trial/comp, vynucené smazání, párování platby
-- — tasky 10/11/12/15) volají ve své transakci přes `perform write_audit_log(...)`.
-- Pro akce, jejichž změna je jediný atomický příkaz, ji TS AuditLogger volá i
-- samostatně přes `supabase.rpc('write_audit_log', ...)` (vlastní atomická transakce).
--
-- BEST-EFFORT before/after (R9.4): zachycení stavu před/po akcí probíhá v TS
-- vrstvě (AuditLogger) a je best-effort — při selhání se předají `null`. Tato
-- funkce proto `p_before`/`p_after` přijímá jako nullable a žádné z polí nevynucuje.
--
-- SECURITY DEFINER: funkce běží jako vlastník, takže může do `audit_log` vložit
-- řádek i po append-only REVOKE z migrace 0034 (která bere INSERT mimo INSERT/SELECT).
-- Funkce dělá VÝHRADNĚ INSERT — je tedy plně v souladu s append-only charakterem.
-- _Requirements: 9.1, 9.2, 9.3, 9.4_
-- _Properties: 2_

create or replace function public.write_audit_log(
  p_actor_user_id uuid,
  p_action_type text,
  p_target_type text,
  p_target_id uuid,
  p_before jsonb default null,
  p_after jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  -- Povinná pole (actor, typ akce, typ cíle) — fail-fast místo tiché chyby (R9.2).
  if p_action_type is null or p_target_type is null then
    raise exception 'Auditní záznam vyžaduje action_type i target_type'
      using errcode = '22023';
  end if;

  insert into public.audit_log (
    actor_user_id,
    action_type,
    target_type,
    target_id,
    before,
    after
  )
  values (
    p_actor_user_id,
    p_action_type,
    p_target_type,
    p_target_id,
    p_before,
    p_after
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.write_audit_log(uuid, text, text, uuid, jsonb, jsonb) is
  'Vloží přesně jeden auditní záznam do public.audit_log a vrátí jeho id (feature admin-dashboard, R9, Property 2). Akční RPC ji volají uvnitř své transakce (stejná transakce jako citlivá akce → atomicita audit+akce); TS AuditLogger ji volá i samostatně. before/after jsou nullable (best-effort kontext, R9.4). SECURITY DEFINER kvůli append-only REVOKE z migrace 0034. Volá ji výhradně server-side service role / jiná SECURITY DEFINER funkce.';

revoke all on function public.write_audit_log(uuid, text, text, uuid, jsonb, jsonb) from public;
grant execute on function public.write_audit_log(uuid, text, text, uuid, jsonb, jsonb) to service_role;
