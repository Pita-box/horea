import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * BusinessManager — seznam podniků pro admin dashboard (feature `admin-dashboard`,
 * Requirement 3).
 *
 * Vrací podniky s názvem, slugem, stavem předplatného a tarifem (R3.1) a umožňuje
 * filtrovat dle stavu předplatného (R3.2), data registrace (R3.3) a fulltextově
 * vyhledávat nad e-mailem vlastníka, názvem podniku a slugem (R3.4). Při prázdném
 * výsledku vrací prázdný seznam (R3.5) — informační hlášku v češtině zobrazuje až
 * stránka, ne tato vrstva.
 *
 * Běží výhradně server-side se service-role klientem (cross-tenant čtení). V duchu
 * *Simplicity First* a při cílovém rozsahu ~200 podniků se filtruje v paměti přes
 * čisté funkce ({@link applyBusinessFilters}) nad jedním načtením s vloženými
 * (embedded) relacemi — žádné křehké filtrování přes embedded resources v PostgREST.
 */

/** Stav předplatného podniku (enum `subscription_status`). */
export type SubscriptionStatus = 'free' | 'active' | 'grace_period' | 'expired' | 'deleted_data';

/** Tarif předplatného (enum `subscription_plan`). */
export type SubscriptionPlan = 'start' | 'pokrocily' | 'max';

/** Stav platby (enum `payment_status`). */
export type PaymentStatus = 'pending' | 'paid' | 'failed';

/** Způsob platby (enum `payment_method`). */
export type PaymentMethod = 'auto_charge' | 'qr_manual' | 'admin_manual';

/** Položka seznamu podniků v admin dashboardu (R3.1). */
export type AdminBusinessListItem = {
  id: string;
  name: string;
  slug: string;
  /** E-mail vlastnícího uživatele; `null`, pokud chybí navázaný účet. */
  ownerEmail: string | null;
  /** Datum registrace podniku (`businesses.created_at`, ISO řetězec). */
  registeredAt: string;
  /** Aktuální stav předplatného; `null`, pokud podnik předplatné nemá. */
  subscriptionStatus: SubscriptionStatus | null;
  /** Aktuální tarif; `null` pro free / bez tarifu. */
  subscriptionPlan: SubscriptionPlan | null;
};

/** Filtry seznamu podniků (R3.2, R3.3, R3.4). */
export type BusinessListFilters = {
  /** Filtr dle stavu předplatného (R3.2). */
  status?: SubscriptionStatus;
  /** Spodní hranice data registrace včetně (R3.3). */
  registeredFrom?: Date | string;
  /** Horní hranice data registrace včetně (R3.3). */
  registeredTo?: Date | string;
  /** Fulltextový výraz nad e-mailem vlastníka, názvem a slugem (R3.4). */
  search?: string;
};

/** Surový řádek vrácený Supabase dotazem s vloženými relacemi. */
type RawBusinessRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  users: { email: string | null } | { email: string | null }[] | null;
  subscriptions:
    | { status: string | null; plan: string | null }
    | { status: string | null; plan: string | null }[]
    | null;
};

/** Vloženou relaci PostgREST vrací buď jako objekt, nebo jednoprvkové pole. */
function firstOrSelf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function toTime(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/** Normalizuje surový řádek na položku seznamu. */
function normalizeRow(row: RawBusinessRow): AdminBusinessListItem {
  const owner = firstOrSelf(row.users);
  const subscription = firstOrSelf(row.subscriptions);

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    ownerEmail: owner?.email ?? null,
    registeredAt: row.created_at,
    subscriptionStatus: (subscription?.status as SubscriptionStatus | null) ?? null,
    subscriptionPlan: (subscription?.plan as SubscriptionPlan | null) ?? null,
  };
}

/**
 * Rozhodne, zda položka odpovídá aktivním filtrům. Čistá funkce — usnadňuje
 * testování shody filtrů a fulltextu (R3.2, R3.3, R3.4).
 */
export function matchesBusinessFilters(
  item: AdminBusinessListItem,
  filters: BusinessListFilters,
): boolean {
  // Stav předplatného (R3.2).
  if (filters.status && item.subscriptionStatus !== filters.status) {
    return false;
  }

  // Rozsah data registrace (R3.3) — obě hranice včetně.
  const registeredAt = toTime(item.registeredAt);
  if (filters.registeredFrom !== undefined && registeredAt < toTime(filters.registeredFrom)) {
    return false;
  }
  if (filters.registeredTo !== undefined && registeredAt > toTime(filters.registeredTo)) {
    return false;
  }

  // Fulltext nad e-mailem vlastníka, názvem a slugem (R3.4).
  const term = filters.search?.trim().toLowerCase();
  if (term) {
    const haystack = [item.ownerEmail, item.name, item.slug]
      .filter((value): value is string => typeof value === 'string')
      .join('\n')
      .toLowerCase();
    if (!haystack.includes(term)) {
      return false;
    }
  }

  return true;
}

/**
 * Aplikuje filtry na seznam položek. Čistá funkce nad již načtenými daty.
 */
export function applyBusinessFilters(
  items: ReadonlyArray<AdminBusinessListItem>,
  filters: BusinessListFilters,
): AdminBusinessListItem[] {
  return items.filter((item) => matchesBusinessFilters(item, filters));
}

/**
 * Načte podniky pro admin dashboard a aplikuje filtry. Vrací seznam seřazený dle
 * data registrace sestupně; při žádné shodě vrací prázdný seznam (R3.5).
 *
 * @param supabase Service-role Supabase klient (cross-tenant čtení).
 * @param filters Volitelné filtry (stav, datum registrace, fulltext).
 */
export async function listBusinesses(
  supabase: SupabaseClient,
  filters: BusinessListFilters = {},
): Promise<AdminBusinessListItem[]> {
  const { data, error } = await supabase
    .from('businesses')
    .select('id, name, slug, created_at, users(email), subscriptions(status, plan)')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Načtení seznamu podniků selhalo: ${error.message}`);
  }

  const items = ((data ?? []) as RawBusinessRow[]).map(normalizeRow);
  return applyBusinessFilters(items, filters);
}

/**
 * Položka historie plateb podniku v detailu admin dashboardu (R4.3). Obsahuje
 * částku, stav, metodu, variabilní symbol a datum platby.
 */
export type AdminPaymentHistoryItem = {
  id: string;
  /** Částka platby v Kč. */
  amountCzk: number;
  /** Stav platby. */
  status: PaymentStatus | null;
  /** Způsob platby. */
  method: PaymentMethod | null;
  /** Variabilní symbol platby. */
  variableSymbol: string | null;
  /** Datum vytvoření platby (ISO řetězec). */
  createdAt: string;
};

/** Detail podniku pro admin dashboard (R4.1–R4.4). */
export type AdminBusinessDetail = {
  id: string;
  name: string;
  slug: string;
  /** Typ podniku (enum `business_type`). */
  type: string;
  /** Popis podniku; `null`, pokud nebyl vyplněn. */
  description: string | null;
  /** Zda je podnik publikovaný. */
  isPublished: boolean;
  /** Datum registrace podniku (`businesses.created_at`, ISO řetězec). */
  registeredAt: string;
  /** Údaje vlastnícího uživatele (R4.1). */
  owner: {
    /** E-mail vlastníka; `null`, pokud chybí navázaný účet. */
    email: string | null;
    /** Datum registrace vlastníka (`users.created_at`, ISO řetězec); `null` bez účtu. */
    registeredAt: string | null;
  };
  /** Aktuální stav, tarif a konec období předplatného (R4.2). */
  subscription: {
    status: SubscriptionStatus | null;
    plan: SubscriptionPlan | null;
    /** Konec aktuálního období (`current_period_end`, ISO řetězec); `null` bez období. */
    currentPeriodEnd: string | null;
  };
  /** Historie plateb seřazená sestupně dle data (R4.3). */
  payments: AdminPaymentHistoryItem[];
  /** Celkový počet rezervací podniku (R4.4). */
  totalReservations: number;
};

/** Surový řádek detailu podniku s vloženými relacemi. */
type RawBusinessDetailRow = {
  id: string;
  name: string;
  slug: string;
  type: string;
  description: string | null;
  is_published: boolean;
  created_at: string;
  users: { email: string | null; created_at: string } | { email: string | null; created_at: string }[] | null;
  subscriptions:
    | { status: string | null; plan: string | null; current_period_end: string | null }
    | { status: string | null; plan: string | null; current_period_end: string | null }[]
    | null;
  payments:
    | RawPaymentRow
    | RawPaymentRow[]
    | null;
};

type RawPaymentRow = {
  id: string;
  amount_czk: number | string;
  status: string | null;
  method: string | null;
  variable_symbol: string | null;
  created_at: string;
};

function normalizePayment(row: RawPaymentRow): AdminPaymentHistoryItem {
  return {
    id: row.id,
    amountCzk: Number(row.amount_czk),
    status: (row.status as PaymentStatus | null) ?? null,
    method: (row.method as PaymentMethod | null) ?? null,
    variableSymbol: row.variable_symbol,
    createdAt: row.created_at,
  };
}

/**
 * Načte detail podniku pro admin dashboard: profil podniku a vlastníka (e-mail,
 * datum registrace), aktuální stav/tarif/`current_period_end`, historii plateb
 * (částka, stav, metoda, VS, datum) a celkový počet rezervací (R4.1–R4.4).
 *
 * Historie plateb se třídí v paměti (sestupně dle data) — při cílovém rozsahu
 * jde o malou množinu a vyhneme se křehkému řazení vložené relace v PostgREST.
 *
 * @param supabase Service-role Supabase klient (cross-tenant čtení).
 * @param id Identifikátor podniku.
 * @returns Detail podniku, nebo `null`, pokud podnik neexistuje.
 */
export async function getBusinessDetail(
  supabase: SupabaseClient,
  id: string,
): Promise<AdminBusinessDetail | null> {
  const { data, error } = await supabase
    .from('businesses')
    .select(
      'id, name, slug, type, description, is_published, created_at, ' +
        'users(email, created_at), ' +
        'subscriptions(status, plan, current_period_end), ' +
        'payments(id, amount_czk, status, method, variable_symbol, created_at)',
    )
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`Načtení detailu podniku selhalo: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const row = data as unknown as RawBusinessDetailRow;
  const owner = firstOrSelf(row.users);
  const subscription = firstOrSelf(row.subscriptions);
  const rawPayments = Array.isArray(row.payments)
    ? row.payments
    : row.payments
      ? [row.payments]
      : [];

  const payments = rawPayments
    .map(normalizePayment)
    .sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));

  // Celkový počet rezervací (R4.4) — samostatný head count, ať se netáhnou řádky.
  const { count, error: countError } = await supabase
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', id);

  if (countError) {
    throw new Error(`Načtení počtu rezervací selhalo: ${countError.message}`);
  }

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: row.type,
    description: row.description,
    isPublished: row.is_published,
    registeredAt: row.created_at,
    owner: {
      email: owner?.email ?? null,
      registeredAt: owner?.created_at ?? null,
    },
    subscription: {
      status: (subscription?.status as SubscriptionStatus | null) ?? null,
      plan: (subscription?.plan as SubscriptionPlan | null) ?? null,
      currentPeriodEnd: subscription?.current_period_end ?? null,
    },
    payments,
    totalReservations: count ?? 0,
  };
}
