import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { SubscriptionStatus } from '@/lib/admin/business-manager';

/**
 * Administrátorské udělení Free_Trial a Comp_Ucet (feature `admin-dashboard`,
 * BusinessManager, task 11.1, R5.3/R5.4/R5.6/R5.7).
 *
 * Skutečná all-or-nothing atomicita (Property 6) NEŽIJE v TypeScriptu — Supabase
 * JS klient neumí držet jednu DB transakci přes více volání. Žije v plpgsql
 * funkcích `admin_grant_free_trial` a `admin_grant_comp` (migrace 0037), které v
 * JEDNÉ transakci pod zámkem řádku `subscriptions` provedou všechny dílčí změny
 * (`subscriptions` + `businesses`) a zavolají `write_audit_log` (migrace 0035).
 * Jakákoli dílčí chyba vrátí úplně všechny změny; úspěch vyprodukuje právě jeden
 * auditní záznam (Property 2).
 *
 * Tyto funkce volá výhradně server-side service role (admin server action); klient
 * i actor (admin user id z auth kontextu) se předávají jako parametry.
 */

/** Vstup pro udělení Free_Trial (R5.3). */
export type GrantFreeTrialInput = {
  /** Administrátor (actor) provádějící akci — z auth kontextu. */
  actorUserId: string;
  /** Identifikátor cílového předplatného. */
  subscriptionId: string;
  /** Konec zkušebního období (`current_period_end`). */
  trialEnd: Date | string;
};

/** Vstup pro udělení Comp_Ucet (R5.4). */
export type GrantCompInput = {
  /** Administrátor (actor) provádějící akci — z auth kontextu. */
  actorUserId: string;
  /** Identifikátor cílového předplatného. */
  subscriptionId: string;
};

/** Výsledek udělení Free_Trial nebo Comp_Ucet. */
export type GrantResult =
  | {
      ok: true;
      subscriptionId: string;
      businessId: string;
      status: SubscriptionStatus;
      currentPeriodEnd: string | null;
    }
  | { ok: false; error: 'not_found' | 'grant_failed' };

type GrantRow = {
  subscription_id: string;
  business_id: string;
  status: SubscriptionStatus;
  current_period_end: string | null;
};

function toIso(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const ms = date.getTime();
  if (Number.isNaN(ms)) {
    throw new Error(`Neplatný konec zkušebního období: "${String(value)}".`);
  }
  return date.toISOString();
}

function mapGrantResult(
  data: unknown,
  error: { message: string } | null,
): GrantResult {
  if (error) {
    return { ok: false, error: 'grant_failed' };
  }

  const row = (Array.isArray(data) ? data[0] : data) as GrantRow | undefined;

  if (!row) {
    return { ok: false, error: 'not_found' };
  }

  return {
    ok: true,
    subscriptionId: row.subscription_id,
    businessId: row.business_id,
    status: row.status,
    currentPeriodEnd: row.current_period_end,
  };
}

/**
 * Udělí Free_Trial — atomicky nastaví `subscription.status = active`,
 * `business.is_published = true`, `subscription.current_period_end` = konec
 * zkušebního období (bez platby) a zapíše auditní záznam `grant_free_trial`
 * (R5.3, R5.6, R5.7, Property 6 + 2). All-or-nothing.
 *
 * @param supabase Service-role Supabase klient.
 * @param input Actor, cílové předplatné a konec zkušebního období.
 * @returns `ok: true` s perzistovaným stavem; `not_found`, pokud předplatné
 *   neexistuje; `grant_failed` při selhání transakce (úplný rollback).
 */
export async function grantFreeTrial(
  supabase: SupabaseClient,
  input: GrantFreeTrialInput,
): Promise<GrantResult> {
  const { data, error } = await supabase.rpc('admin_grant_free_trial', {
    p_actor_user_id: input.actorUserId,
    p_subscription_id: input.subscriptionId,
    p_trial_end: toIso(input.trialEnd),
  });

  return mapGrantResult(data, error);
}

/**
 * Udělí Comp_Ucet — atomicky nastaví `subscription.status = active` a
 * `business.is_published = true` (bez platby a bez recurring schedule) a zapíše
 * auditní záznam `grant_comp` (R5.4, R5.6, R5.7, Property 6 + 2). All-or-nothing.
 *
 * @param supabase Service-role Supabase klient.
 * @param input Actor a cílové předplatné.
 * @returns `ok: true` s perzistovaným stavem; `not_found`, pokud předplatné
 *   neexistuje; `grant_failed` při selhání transakce (úplný rollback).
 */
export async function grantComp(
  supabase: SupabaseClient,
  input: GrantCompInput,
): Promise<GrantResult> {
  const { data, error } = await supabase.rpc('admin_grant_comp', {
    p_actor_user_id: input.actorUserId,
    p_subscription_id: input.subscriptionId,
  });

  return mapGrantResult(data, error);
}
