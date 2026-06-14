import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { SubscriptionPlan, SubscriptionStatus } from '@/lib/admin/business-manager';

/**
 * Administrátorské akce nad předplatným — override stavu předplatného (R5.1,
 * R5.2) a pozastavení podniku (R5.5). Feature `admin-dashboard`, tasky 10.1/10.2.
 *
 * Skutečná atomicita „akce + auditní záznam" NEŽIJE v TypeScriptu — Supabase JS
 * klient neumí držet jednu DB transakci přes více volání. Žije v plpgsql funkcích
 * `admin_override_subscription` a `admin_suspend_business` (migrace 0036), které
 * ve STEJNÉ transakci provedou změnu a zavolají `write_audit_log` (migrace 0035).
 * Tím je zaručena Property 2 — právě jeden auditní záznam na úspěšnou akci.
 *
 * Override **vědomě obchází** stavový automat ze `subscription-payments` (design.md,
 * *Admin subscription override*) — jde o privilegovanou pravomoc admina, ne o
 * běžný přechod automatu.
 *
 * Tyto funkce volá výhradně server-side service role (admin server action); klient
 * i actor (admin user id z auth kontextu) se předávají jako parametry.
 */

/** Vstup pro override předplatného (R5.1, R5.2). */
export type SubscriptionOverrideInput = {
  /** Administrátor (actor) provádějící akci — z auth kontextu. */
  actorUserId: string;
  /** Identifikátor cílového předplatného. */
  subscriptionId: string;
  /** Cílový tarif; `null` pro free / bez tarifu. */
  plan: SubscriptionPlan | null;
  /** Cílový stav předplatného. */
  status: SubscriptionStatus;
  /** Cílový konec období; `null` pro předplatné bez období. */
  currentPeriodEnd: Date | string | null;
};

/** Výsledek override předplatného. */
export type SubscriptionOverrideResult =
  | {
      ok: true;
      subscriptionId: string;
      businessId: string;
      plan: SubscriptionPlan | null;
      status: SubscriptionStatus;
      currentPeriodEnd: string | null;
    }
  | { ok: false; error: 'not_found' | 'override_failed' };

/** Výsledek pozastavení podniku. */
export type SuspendBusinessResult =
  | { ok: true; businessId: string; isPublished: false }
  | { ok: false; error: 'not_found' | 'suspend_failed' };

type OverrideRow = {
  subscription_id: string;
  business_id: string;
  plan: SubscriptionPlan | null;
  status: SubscriptionStatus;
  current_period_end: string | null;
};

type SuspendRow = {
  business_id: string;
  is_published: boolean;
};

function toIso(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }
  const date = typeof value === 'string' ? new Date(value) : value;
  const ms = date.getTime();
  if (Number.isNaN(ms)) {
    throw new Error(`Neplatné datum pro override předplatného: "${String(value)}".`);
  }
  return date.toISOString();
}

/**
 * Přímý override předplatného — nastaví `plan`, `status` a `current_period_end`
 * na zvolené hodnoty a ve stejné transakci zapíše auditní záznam
 * `subscription_override` s before/after (R5.1, R5.2, R5.7, Property 2).
 *
 * @param supabase Service-role Supabase klient.
 * @param input Actor, cílové předplatné a cílové hodnoty.
 * @returns `ok: true` s perzistovanými hodnotami; `not_found`, pokud předplatné
 *   neexistuje; `override_failed` při selhání transakce.
 */
export async function overrideSubscription(
  supabase: SupabaseClient,
  input: SubscriptionOverrideInput,
): Promise<SubscriptionOverrideResult> {
  const { data, error } = await supabase.rpc('admin_override_subscription', {
    p_actor_user_id: input.actorUserId,
    p_subscription_id: input.subscriptionId,
    p_plan: input.plan,
    p_status: input.status,
    p_current_period_end: toIso(input.currentPeriodEnd),
  });

  if (error) {
    return { ok: false, error: 'override_failed' };
  }

  const row = (Array.isArray(data) ? data[0] : data) as OverrideRow | undefined;

  if (!row) {
    return { ok: false, error: 'not_found' };
  }

  return {
    ok: true,
    subscriptionId: row.subscription_id,
    businessId: row.business_id,
    plan: row.plan,
    status: row.status,
    currentPeriodEnd: row.current_period_end,
  };
}

/**
 * Pozastavení podniku — nastaví `business.is_published = false` a ve stejné
 * transakci zapíše auditní záznam `suspend_business` s before/after (R5.5, R5.7,
 * Property 2).
 *
 * @param supabase Service-role Supabase klient.
 * @param input Actor a cílový podnik.
 * @returns `ok: true`, pokud byl podnik pozastaven; `not_found`, pokud podnik
 *   neexistuje; `suspend_failed` při selhání transakce.
 */
export async function suspendBusiness(
  supabase: SupabaseClient,
  input: { actorUserId: string; businessId: string },
): Promise<SuspendBusinessResult> {
  const { data, error } = await supabase.rpc('admin_suspend_business', {
    p_actor_user_id: input.actorUserId,
    p_business_id: input.businessId,
  });

  if (error) {
    return { ok: false, error: 'suspend_failed' };
  }

  const row = (Array.isArray(data) ? data[0] : data) as SuspendRow | undefined;

  if (!row) {
    return { ok: false, error: 'not_found' };
  }

  return { ok: true, businessId: row.business_id, isPublished: false };
}
