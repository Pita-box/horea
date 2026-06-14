-- ---------------------------------------------------------------------------
-- 0043 — Admin override předplatného synchronizuje publikovanost profilu
-- ---------------------------------------------------------------------------
-- Problém: admin_override_subscription (0036) měnil pouze plan/status/
-- current_period_end, ale NE businesses.is_published. Veřejný profil je přitom
-- viditelný jen přes is_business_published(id) = (is_published = true AND
-- subscription.status IN ('active','grace_period')). Override free → active tak
-- aktivoval předplatné, ale profil zůstal skrytý.
--
-- Oprava: override nově srovná is_published se cílovým stavem — pro active a
-- grace_period publikuje, jinak skryje. Tím se chová konzistentně se stavovým
-- automatem (activateSubscription publikuje, expireSubscription skrývá) a s granty
-- (free_trial/comp publikují). Audit i signatura zůstávají beze změny.
-- ---------------------------------------------------------------------------

create or replace function public.admin_override_subscription(
  p_actor_user_id uuid,
  p_subscription_id uuid,
  p_plan public.subscription_plan,
  p_status public.subscription_status,
  p_current_period_end timestamptz
)
returns table (
  subscription_id uuid,
  business_id uuid,
  plan public.subscription_plan,
  status public.subscription_status,
  current_period_end timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  -- (1) Zámek řádku předplatného do konce transakce + zachycení stavu PŘED akcí
  --     (before) pro auditní záznam.
  select s.business_id,
         jsonb_build_object(
           'plan', s.plan,
           'status', s.status,
           'current_period_end', s.current_period_end
         )
    into v_business_id, v_before
  from public.subscriptions s
  where s.id = p_subscription_id
  for update;

  if not found then
    return;
  end if;

  -- (2) Přímý override (vědomé obejití stavového automatu — R5.1, R5.2).
  update public.subscriptions
  set plan = p_plan,
      status = p_status,
      current_period_end = p_current_period_end,
      updated_at = now()
  where id = p_subscription_id;

  -- (2b) Synchronizace publikovanosti profilu se cílovým stavem: active a
  --      grace_period → publikovaný, ostatní stavy → skrytý. Bez tohoto kroku
  --      by override na active nechal profil neviditelný (is_business_published
  --      vyžaduje is_published = true).
  update public.businesses
  set is_published = (p_status in ('active', 'grace_period'))
  where id = v_business_id;

  v_after := jsonb_build_object(
    'plan', p_plan,
    'status', p_status,
    'current_period_end', p_current_period_end
  );

  -- (3) Auditní záznam ve STEJNÉ transakci jako override (R5.7, Property 2).
  perform public.write_audit_log(
    p_actor_user_id,
    'subscription_override',
    'subscription',
    p_subscription_id,
    v_before,
    v_after
  );

  return query
    select p_subscription_id, v_business_id, p_plan, p_status, p_current_period_end;
end;
$$;

comment on function public.admin_override_subscription(uuid, uuid, public.subscription_plan, public.subscription_status, timestamptz) is
  'Administrátorský override předplatného: nastaví plan/status/current_period_end a synchronizuje businesses.is_published se cílovým stavem (active/grace_period → publikováno, jinak skryto). Ve stejné transakci zapíše auditní záznam subscription_override. Vrací prázdnou tabulku, pokud předplatné neexistuje. Volá ji výhradně server-side service role.';

revoke all on function public.admin_override_subscription(uuid, uuid, public.subscription_plan, public.subscription_status, timestamptz) from public;
grant execute on function public.admin_override_subscription(uuid, uuid, public.subscription_plan, public.subscription_status, timestamptz) to service_role;
