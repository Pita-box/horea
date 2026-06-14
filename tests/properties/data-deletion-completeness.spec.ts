import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

/**
 * Feature: subscription-payments, Property 8: Úplnost mazání dat.
 *
 * Cleanup_Cron deleguje vlastní výmaz na atomické RPC `delete_business_tenant_data`
 * (migrace 0030). Tento property test ověřuje KONTRAKT té operace nad in-memory
 * modelem věrně zrcadlícím SQL — stejným způsobem jako
 * `anonymization-completeness.spec.ts`. Pro libovolný dataset podniku (prázdný
 * i bohatý: služby / rezervace / klienti / otevírací doby) po smazání platí
 * (R6.7, R6.8, Property 8):
 *
 *  - veškerá tenant data CÍLOVÉHO podniku jsou smazána (rezervace, klienti,
 *    služby, otevírací doby) — zůstává 0 řádků,
 *  - řádek `businesses` zůstává, ale s VYPRÁZDNĚNÝM profilem (`name=''`,
 *    `description=null`, `logo_url=null`, `is_published=false`), přičemž
 *    `slug` a `type` se zachovají,
 *  - řádek `users` (e-mail + password hash) zůstává beze změny,
 *  - kompletní historie `subscriptions` a `payments` zůstává zachována; status
 *    cílového předplatného je `deleted_data`,
 *  - data JINÉHO podniku (izolace) zůstávají zcela beze změny,
 *  - funguje i pro prázdný dataset (žádná tenant data k smazání).
 *
 * Model RPC aplikuje tytéž operace jako migrace 0030; očekávaný post-stav počítá
 * NEZÁVISLÝ oracle (deklarativně, jinou cestou), takže test ověřuje completeness,
 * ne tautologii.
 *
 * Validates: Requirements 6.7, 6.8
 */

const NUM_RUNS = 150;

const TARGET_BIZ = 'biz-target';
const OTHER_BIZ = 'biz-other';

type BusinessRow = {
  id: string;
  slug: string;
  type: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  is_published: boolean;
  auto_approve_reservations: boolean;
  allow_parallel_slots: boolean;
};

type SubscriptionRow = {
  id: string;
  business_id: string;
  status: string;
  plan: string;
  first_failed_charge_at: string | null;
};

type PaymentRow = {
  id: string;
  business_id: string;
  amount_czk: number;
  status: string;
};

type TenantRow = { id: string; business_id: string };

type UserRow = { id: string; email: string; encrypted_password: string };

type Store = {
  businesses: BusinessRow[];
  subscriptions: SubscriptionRow[];
  payments: PaymentRow[];
  reservations: TenantRow[];
  clients: TenantRow[];
  services: TenantRow[];
  opening_hours: TenantRow[];
  users: UserRow[];
};

type RpcResultRow = { business_id: string; subscription_id: string };

/**
 * Model RPC `delete_business_tenant_data` nad in-memory storem — věrně zrcadlí
 * operace migrace 0030 (mazání tenant tabulek, vyprázdnění profilu, přechod do
 * `deleted_data`), vše „atomicky" (synchronně v jednom kroku).
 *
 * Vrací prázdný výsledek, pokud podnik nemá předplatné (jako `RETURN` v SQL).
 */
function fakeDeleteBusinessTenantData(store: Store, businessId: string): RpcResultRow[] {
  const sub = store.subscriptions.find((s) => s.business_id === businessId);
  if (!sub) {
    return [];
  }

  // (2) Smazání tenant dat.
  store.reservations = store.reservations.filter((r) => r.business_id !== businessId);
  store.clients = store.clients.filter((c) => c.business_id !== businessId);
  store.services = store.services.filter((s) => s.business_id !== businessId);
  store.opening_hours = store.opening_hours.filter((o) => o.business_id !== businessId);

  // (3) Vyprázdnění profilu podniku (slug + type se zachovají).
  const business = store.businesses.find((b) => b.id === businessId);
  if (business) {
    business.name = '';
    business.description = null;
    business.logo_url = null;
    business.is_published = false;
    business.auto_approve_reservations = false;
    business.allow_parallel_slots = false;
  }

  // (4) Přechod předplatného do deleted_data.
  sub.status = 'deleted_data';

  return [{ business_id: businessId, subscription_id: sub.id }];
}

const tenantArb = (prefix: string, businessId: string) =>
  fc
    .array(fc.integer({ min: 0, max: 9999 }), { maxLength: 6 })
    .map((ids) => ids.map((n, i) => ({ id: `${prefix}-${businessId}-${i}-${n}`, business_id: businessId })));

/** Generuje dataset cílového podniku (vč. prázdného) + pevná data druhého podniku. */
const datasetArb = fc.record({
  reservations: tenantArb('res', TARGET_BIZ),
  clients: tenantArb('cli', TARGET_BIZ),
  services: tenantArb('svc', TARGET_BIZ),
  opening_hours: tenantArb('oh', TARGET_BIZ),
  name: fc.string({ minLength: 0, maxLength: 20 }),
  description: fc.option(fc.string({ maxLength: 30 }), { nil: null }),
  logoUrl: fc.option(fc.webUrl(), { nil: null }),
  isPublished: fc.boolean(),
  plan: fc.constantFrom('start', 'pokrocily', 'max'),
  anchor: fc.option(fc.constant('2024-11-01T00:00:00.000Z'), { nil: null }),
  paymentsCount: fc.integer({ min: 0, max: 4 }),
});

function buildStore(spec: fc.infer<typeof datasetArb>): Store {
  const targetPayments: PaymentRow[] = Array.from({ length: spec.paymentsCount }, (_, i) => ({
    id: `pay-${TARGET_BIZ}-${i}`,
    business_id: TARGET_BIZ,
    amount_czk: [199, 299, 599][i % 3],
    status: i % 2 === 0 ? 'paid' : 'failed',
  }));

  return {
    businesses: [
      {
        id: TARGET_BIZ,
        slug: 'cilovy-podnik',
        type: 'kadernictvi',
        name: spec.name,
        description: spec.description,
        logo_url: spec.logoUrl,
        is_published: spec.isPublished,
        auto_approve_reservations: true,
        allow_parallel_slots: true,
      },
      {
        id: OTHER_BIZ,
        slug: 'jiny-podnik',
        type: 'kavarna',
        name: 'Jiný podnik',
        description: 'zůstává',
        logo_url: 'https://example/logo.png',
        is_published: true,
        auto_approve_reservations: true,
        allow_parallel_slots: false,
      },
    ],
    subscriptions: [
      {
        id: `sub-${TARGET_BIZ}`,
        business_id: TARGET_BIZ,
        status: 'expired',
        plan: spec.plan,
        first_failed_charge_at: spec.anchor,
      },
      {
        id: `sub-${OTHER_BIZ}`,
        business_id: OTHER_BIZ,
        status: 'active',
        plan: 'max',
        first_failed_charge_at: null,
      },
    ],
    payments: [
      ...targetPayments,
      { id: `pay-${OTHER_BIZ}-0`, business_id: OTHER_BIZ, amount_czk: 599, status: 'paid' },
    ],
    reservations: [...spec.reservations, { id: 'res-other-0', business_id: OTHER_BIZ }],
    clients: [...spec.clients, { id: 'cli-other-0', business_id: OTHER_BIZ }],
    services: [...spec.services, { id: 'svc-other-0', business_id: OTHER_BIZ }],
    opening_hours: [...spec.opening_hours, { id: 'oh-other-0', business_id: OTHER_BIZ }],
    users: [
      { id: 'user-1', email: 'majitel@example.cz', encrypted_password: 'hash$argon2id$abc' },
      { id: 'user-2', email: 'jiny@example.cz', encrypted_password: 'hash$argon2id$xyz' },
    ],
  };
}

describe('Property 8: úplnost mazání dat', () => {
  it('tenant data cílového podniku smazána, historie + users + jiný podnik zachovány', () => {
    fc.assert(
      fc.property(datasetArb, (spec) => {
        const store = buildStore(spec);

        // Nezávislé snapshoty PŘED smazáním pro pozdější srovnání.
        const usersBefore = store.users.map((u) => ({ ...u }));
        const otherBusinessBefore = { ...store.businesses.find((b) => b.id === OTHER_BIZ)! };
        const paymentsBefore = store.payments.map((p) => ({ ...p }));
        const targetSubId = `sub-${TARGET_BIZ}`;
        const subscriptionsBefore = store.subscriptions.map((s) => ({ ...s }));
        const otherTenantCountsBefore = {
          reservations: store.reservations.filter((r) => r.business_id === OTHER_BIZ).length,
          clients: store.clients.filter((c) => c.business_id === OTHER_BIZ).length,
          services: store.services.filter((s) => s.business_id === OTHER_BIZ).length,
          opening_hours: store.opening_hours.filter((o) => o.business_id === OTHER_BIZ).length,
        };

        const result = fakeDeleteBusinessTenantData(store, TARGET_BIZ);

        // RPC vrátí právě jeden řádek (podnik s předplatným existuje).
        expect(result).toEqual([{ business_id: TARGET_BIZ, subscription_id: targetSubId }]);

        // (a) Veškerá tenant data cílového podniku jsou smazána (R6.7).
        expect(store.reservations.filter((r) => r.business_id === TARGET_BIZ)).toHaveLength(0);
        expect(store.clients.filter((c) => c.business_id === TARGET_BIZ)).toHaveLength(0);
        expect(store.services.filter((s) => s.business_id === TARGET_BIZ)).toHaveLength(0);
        expect(store.opening_hours.filter((o) => o.business_id === TARGET_BIZ)).toHaveLength(0);

        // (b) Řádek businesses zůstává s vyprázdněným profilem; slug + type zachovány.
        const targetBusiness = store.businesses.find((b) => b.id === TARGET_BIZ);
        expect(targetBusiness).toBeDefined();
        expect(targetBusiness!.name).toBe('');
        expect(targetBusiness!.description).toBeNull();
        expect(targetBusiness!.logo_url).toBeNull();
        expect(targetBusiness!.is_published).toBe(false);
        expect(targetBusiness!.slug).toBe('cilovy-podnik');
        expect(targetBusiness!.type).toBe('kadernictvi');

        // (c) users zůstávají beze změny (R6.8).
        expect(store.users).toEqual(usersBefore);

        // (d) Historie payments beze změny (R6.8).
        expect(store.payments).toEqual(paymentsBefore);

        // (e) Subscriptions zachovány; cílové je deleted_data, ostatní beze změny.
        expect(store.subscriptions).toHaveLength(subscriptionsBefore.length);
        const targetSub = store.subscriptions.find((s) => s.id === targetSubId);
        expect(targetSub!.status).toBe('deleted_data');
        expect(targetSub!.plan).toBe(spec.plan);
        expect(targetSub!.first_failed_charge_at).toBe(spec.anchor);
        const otherSub = store.subscriptions.find((s) => s.business_id === OTHER_BIZ);
        expect(otherSub).toEqual(subscriptionsBefore.find((s) => s.business_id === OTHER_BIZ));

        // (f) Izolace: data jiného podniku zcela beze změny.
        expect(store.businesses.find((b) => b.id === OTHER_BIZ)).toEqual(otherBusinessBefore);
        expect(store.reservations.filter((r) => r.business_id === OTHER_BIZ)).toHaveLength(
          otherTenantCountsBefore.reservations,
        );
        expect(store.clients.filter((c) => c.business_id === OTHER_BIZ)).toHaveLength(
          otherTenantCountsBefore.clients,
        );
        expect(store.services.filter((s) => s.business_id === OTHER_BIZ)).toHaveLength(
          otherTenantCountsBefore.services,
        );
        expect(store.opening_hours.filter((o) => o.business_id === OTHER_BIZ)).toHaveLength(
          otherTenantCountsBefore.opening_hours,
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
