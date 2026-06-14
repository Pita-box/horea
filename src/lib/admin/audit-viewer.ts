import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { AuditActionType, AuditTargetType } from './audit-logger';

/**
 * AuditLogViewer — read-only prohlížení auditní stopy `audit_log` (feature
 * `admin-dashboard`, Requirement 10).
 *
 * Vrací záznamy seřazené **sestupně podle `created_at`** (R10.1, nejnovější
 * nahoře — využívá index `audit_log_created_at_idx`) a umožňuje filtrovat dle
 * typu akce (R10.2), časového rozsahu (R10.3) a cílového objektu — `target_id`
 * a/nebo `target_type` (R10.4).
 *
 * Tato vrstva je **výhradně čtecí**: neobsahuje žádnou operaci, která by auditní
 * záznam upravila nebo smazala. Append-only charakter `audit_log` je navíc
 * vynucen na úrovni DB (migrace 0034), takže nepopiratelnost stopy nestojí jen
 * na absenci zápisových funkcí zde.
 *
 * Běží výhradně server-side se service-role klientem (cross-tenant čtení).
 */

/** Jeden záznam auditní stopy (R10.1). */
export type AuditLogRecord = {
  id: string;
  /** Identifikátor administrátora (actor); `null`, pokud byl účet odstraněn. */
  actorUserId: string | null;
  /** Typ akce (R10.2). */
  actionType: AuditActionType | string;
  /** Typ cílového objektu (R10.4). */
  targetType: AuditTargetType | string;
  /** Identifikátor cílového objektu (R10.4); `null` u akcí bez cíle. */
  targetId: string | null;
  /** Stav cílového objektu před akcí; `null`, pokud nebyl zachycen. */
  before: unknown;
  /** Stav cílového objektu po akci; `null`, pokud nebyl zachycen. */
  after: unknown;
  /** Časové razítko vytvoření záznamu (ISO řetězec). */
  createdAt: string;
};

/** Filtry prohlížení auditní stopy (R10.2, R10.3, R10.4). */
export type AuditLogFilters = {
  /** Filtr dle typu akce (R10.2). */
  actionType?: AuditActionType | string;
  /** Spodní hranice času vytvoření včetně (R10.3). */
  createdFrom?: Date | string;
  /** Horní hranice času vytvoření včetně (R10.3). */
  createdTo?: Date | string;
  /** Filtr dle typu cílového objektu (R10.4). */
  targetType?: AuditTargetType | string;
  /** Filtr dle identifikátoru cílového objektu (R10.4). */
  targetId?: string;
};

/** Surový řádek vrácený Supabase dotazem. */
type RawAuditRow = {
  id: string;
  actor_user_id: string | null;
  action_type: string;
  target_type: string;
  target_id: string | null;
  before: unknown;
  after: unknown;
  created_at: string;
};

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeRow(row: RawAuditRow): AuditLogRecord {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    actionType: row.action_type,
    targetType: row.target_type,
    targetId: row.target_id,
    before: row.before,
    after: row.after,
    createdAt: row.created_at,
  };
}

/**
 * Načte auditní záznamy seřazené sestupně podle `created_at` (R10.1) s volitelnými
 * filtry (R10.2, R10.3, R10.4). Při žádné shodě vrací prázdný seznam.
 *
 * @param supabase Service-role Supabase klient (cross-tenant čtení).
 * @param filters Volitelné filtry (typ akce, časový rozsah, cílový objekt).
 */
export async function listAuditLog(
  supabase: SupabaseClient,
  filters: AuditLogFilters = {},
): Promise<AuditLogRecord[]> {
  let query = supabase
    .from('audit_log')
    .select('id, actor_user_id, action_type, target_type, target_id, before, after, created_at')
    .order('created_at', { ascending: false });

  if (filters.actionType) {
    query = query.eq('action_type', filters.actionType);
  }
  if (filters.targetType) {
    query = query.eq('target_type', filters.targetType);
  }
  if (filters.targetId) {
    query = query.eq('target_id', filters.targetId);
  }
  if (filters.createdFrom !== undefined) {
    query = query.gte('created_at', toIso(filters.createdFrom));
  }
  if (filters.createdTo !== undefined) {
    query = query.lte('created_at', toIso(filters.createdTo));
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Načtení auditní stopy selhalo: ${error.message}`);
  }

  return ((data ?? []) as RawAuditRow[]).map(normalizeRow);
}
