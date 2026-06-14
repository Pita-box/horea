import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

/**
 * Feature: admin-dashboard, Property 7: Úplnost vynuceného smazání podniku.
 *
 * Vynucené smazání (`admin_force_delete_business`, migrace 0038) žije v jediné
 * plpgsql transakci: zachytí profil podniku (before), ZNOVUPOUŽIJE existující
 * `delete_business_tenant_data` (migrace 0030, vlastněná `subscription-payments`)
 * ke smazání tenant dat a vyprázdnění profilu, a ve stejné transakci zapíše
 * PRÁVĚ jeden auditní záznam `force_delete_business`. Tento property test ověřuje
 * KONTRAKT té transakce nad in-memory modelem věrně zrcadlícím SQL.
 *
 * POZN. K NEDUPLIKACI: `data-deletion-completeness.spec.ts` (subscription-payments
 * Property 8) ověřuje samotnou cleanup logiku `delete_business_tenant_data`
 * (vyprázdnění profilu, izolace jiného podniku atd.). Tento test je samostatný a
 * cílí na ADMIN force-delete KONTRAKT: (1) smazání tenant dat, (2) zachování
 * historie `subscriptions`/`payments` beze změny, (3) přesně 1 auditní záznam.
 * Cleanup logiku zde nemodelujeme znovu do detailu — voláme její věrný model a
 * ověřujeme nadstavbu force-delete.
 *
 * Pro libovolný dataset podniku (prázdný i bohatý) proto platí (R6.2, R6.3): po
 * smazání neexistují žádná tenant data podniku, zatímco kompletní historie
 * `subscriptions`/`payments` zůstává beze změny zachována, a vznikl právě jeden
 * auditní záznam `force_delete_business`.
 *
 * NEZÁVISLÝ ORACLE: očekávaný post-stav (0 tenant řádků, nezměněná historie)
 * se počítá deklarativně ze snapshotu PŘED smazáním, jinou cestou než imperativní
 * model RPC, takže test ověřuje completeness, ne tautologii. Žádná reálná DB.
 *
 * Validates: Requirements 6.2, 6.3
 */

const NUM_RUNS = 150;

const TARGET_BIZ = 'biz-target';

type TenantRow = { id: string; business_id: string };

type BusinessRow = {
  id: string;
  slug: string;
  type: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  is_published: boolean;
};

type SubscriptionRow = { id: string; business_id: string; status: string; plan: string };

type PaymentRow = { id: string; business_id: string; amount_czk: number; status: string };

type AuditRecord = {
  id: string;
  actor_user_id: string;
  action_type: string;
  target_type: string;
  target_id: string;
  before: unknown;
  after: unknown;
};

type Store = {
  businesses: BusinessRow[];
  subscriptions: SubscriptionRow[];
  payments: PaymentRow[];
  reservations: TenantRow[];
  clients: TenantRow[];
  services: TenantRow[];
  opening_hours: TenantRow[];
  audit_log: AuditRecord[];
};

/**
 * Věrný model cleanup RPC `delete_business_tenant_data` (migrace 0030): smaže
 * tenant data, vyprázdní profil (slug + type zachová), nastaví subscription do
 * `deleted_data`. Vrací subscription_id, nebo `null`, pokud podnik nemá předplatné.
 */
function deleteBusinessTenantData(store: Store, businessId: string): string | null {
  const sub = store.subscriptions.find((s) => s.business_id === businessId);
  if (!sub) {
    return null;
  }
  store.reservations = store.reservations.filter((r) => r.business_id !== businessId);
  store.clients = store.clients.filter((c) => c.business_id !== businessId);
  store.services = store.services.filter((s) => s.business_id !== businessId);
  store.opening_hours = store.opening_hours.filter((o) => o.business_id !== businessId);

  const business = store.businesses.find((b) => b.id === businessId);
  if (business) {
    business.name = '';
    business.description = null;
    business.logo_url = null;
    business.is_published = false;
  }
  sub.status = 'deleted_data';
  return sub.id;
}

/**
 * Model admin force-delete transakce (migrace 0038): before profil → cleanup →
 * 1 auditní záznam ve stejné transakci. Vrací výsledek nebo `null` (not_found).
 */
function adminForceDeleteBusiness(
  store: Store,
  actorUserId: string,
  businessId: string,
): { business_id: string; subscription_id: string | null } | null {
  const business = store.businesses.find((b) => b.id === businessId);
  if (!business) {
    return null;
  }
  const before = { name: business.name, slug: business.slug, is_published: business.is_published };

  const subscriptionId = deleteBusinessTenantData(store, businessId);

  store.audit_log.push({
    id: `audit-${store.audit_log.length + 1}`,
    actor_user_id: actorUserId,
    action_type: 'force_delete_business',
    target_type: 'business',
    target_id: businessId,
    before,
    after: { tenant_data_deleted: true },
  });

  return { business_id: businessId, subscription_id: subscriptionId };
}

const tenantArb = (prefix: string) =>
  fc
    .array(fc.integer({ min: 0, max: 9999 }), { maxLength: 6 })
    .map((ids) => ids.map((n, i) => ({ id: `${prefix}-${i}-${n}`, business_id: TARGET_BIZ })));

const datasetArb = fc.record({
  reservations: tenantArb('res'),
  clients: tenantArb('cli'),
  services: tenantArb('svc'),
  opening_hours: tenantArb('oh'),
  name: fc.string({ minLength: 0, maxLength: 20 }),
  isPublished: fc.boolean(),
  plan: fc.constantFrom('start', 'pokrocily', 'max'),
  paymentsCount: fc.integer({ min: 0, max: 5 }),
});

describe('Property 7: úplnost vynuceného smazání podniku', () => {
  it('po smazání nejsou tenant data, historie subscriptions/payments zachována, právě 1 audit', () => {
    fc.assert(
      fc.property(datasetArb, (spec) => {
        const payments: PaymentRow[] = Array.from({ length: spec.paymentsCount }, (_, i) => ({
          id: `pay-${i}`,
          business_id: TARGET_BIZ,
          amount_czk: [199, 299, 599][i % 3],
          status: i % 2 === 0 ? 'paid' : 'failed',
        }));

        const store: Store = {
          businesses: [
            {
              id: TARGET_BIZ,
              slug: 'cilovy-podnik',
              type: 'kadernictvi',
              name: spec.name,
              description: 'popis',
              logo_url: 'https://example/logo.png',
              is_published: spec.isPublished,
            },
          ],
          subscriptions: [{ id: 'sub-target', business_id: TARGET_BIZ, status: 'expired', plan: spec.plan }],
          payments,
          reservations: [...spec.reservations],
          clients: [...spec.clients],
          services: [...spec.services],
          opening_hours: [...spec.opening_hours],
          audit_log: [],
        };

        // NEZÁVISLÉ snapshoty historie PŘED smazáním.
        const paymentsBefore = store.payments.map((p) => ({ ...p }));
        const subscriptionsBefore = store.subscriptions.map((s) => ({ ...s }));

        const result = adminForceDeleteBusiness(store, 'admin-1', TARGET_BIZ);

        expect(result).not.toBeNull();
        expect(result!.business_id).toBe(TARGET_BIZ);
        expect(result!.subscription_id).toBe('sub-target');

        // (a) Veškerá tenant data cílového podniku smazána (R6.2).
        expect(store.reservations.filter((r) => r.business_id === TARGET_BIZ)).toHaveLength(0);
        expect(store.clients.filter((c) => c.business_id === TARGET_BIZ)).toHaveLength(0);
        expect(store.services.filter((s) => s.business_id === TARGET_BIZ)).toHaveLength(0);
        expect(store.opening_hours.filter((o) => o.business_id === TARGET_BIZ)).toHaveLength(0);

        // (b) Historie payments beze změny — zachování pro účetní účely (R6.3).
        expect(store.payments).toEqual(paymentsBefore);

        // (c) Historie subscriptions zachována (řádek nadále existuje); změnil se
        //     pouze status na deleted_data (cleanup), ostatní pole beze změny.
        expect(store.subscriptions).toHaveLength(subscriptionsBefore.length);
        const targetSub = store.subscriptions.find((s) => s.id === 'sub-target');
        expect(targetSub).toBeDefined();
        expect(targetSub!.plan).toBe(spec.plan);
        expect(targetSub!.business_id).toBe(TARGET_BIZ);

        // (d) Force-delete kontrakt: právě 1 auditní záznam force_delete_business.
        expect(store.audit_log).toHaveLength(1);
        const audit = store.audit_log[0];
        expect(audit.action_type).toBe('force_delete_business');
        expect(audit.target_type).toBe('business');
        expect(audit.target_id).toBe(TARGET_BIZ);
        expect(audit.actor_user_id).toBe('admin-1');
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
