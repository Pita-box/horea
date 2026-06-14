import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

/**
 * Feature: admin-dashboard, Property 6: Atomicita udělení Free_Trial a Comp_Ucet.
 *
 * Udělení Free_Trial (`admin_grant_free_trial`) i Comp_Ucet (`admin_grant_comp`)
 * žije v jediné plpgsql transakci (migrace 0037): pod zámkem řádku `subscriptions`
 * provede více dílčích změn (`subscriptions` + `businesses`) a zavolá
 * `write_audit_log` (migrace 0035). Jakákoli dílčí chyba vrátí ÚPLNĚ všechny
 * změny (all-or-nothing). Tento property test ověřuje KONTRAKT té transakce nad
 * in-memory modelem věrně zrcadlícím SQL (stejný vzor jako
 * `data-deletion-completeness.spec.ts`):
 *
 *  - transakce snapshotuje stav na začátku; pokud kterýkoli krok (update
 *    subscriptions / update businesses / zápis auditu) selže, celý store se
 *    obnoví na původní stav — žádná dílčí změna nepřetrvá,
 *  - Free_Trial při úspěchu: `status=active`, `is_published=true`,
 *    `current_period_end` = konec zkušebního období (R5.3),
 *  - Comp_Ucet při úspěchu: `status=active`, `is_published=true`,
 *    `current_period_end` se NEMĚNÍ (trvalý účet bez schedule) (R5.4),
 *  - každý úspěch vytvoří přesně jeden auditní záznam (Property 2).
 *
 * Pro libovolný počáteční stav předplatného a libovolný bod selhání proto platí
 * (R5.6): po selhání je stav předplatného i podniku SHODNÝ s původním (úplný
 * rollback); při úspěchu odpovídá cílovým hodnotám + 1 audit.
 *
 * NEZÁVISLÝ ORACLE: očekávaný post-stav (rollback vs. cílové hodnoty) se počítá
 * deklarativně z generovaného vstupu jinou cestou než imperativní transakční
 * runner, takže test ověřuje atomicitu, ne tautologii. Žádná reálná DB.
 *
 * Validates: Requirements 5.6
 */

const NUM_RUNS = 200;

type SubscriptionStatus = 'free' | 'active' | 'grace_period' | 'expired' | 'deleted_data';
type SubscriptionPlan = 'start' | 'pokrocily' | 'max' | null;

type SubscriptionRow = {
  id: string;
  business_id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  current_period_end: string | null;
};

type BusinessRow = { id: string; is_published: boolean };

type AuditRecord = { id: string; action_type: string; target_id: string };

type Store = {
  subscription: SubscriptionRow;
  business: BusinessRow;
  audit_log: AuditRecord[];
};

/** Bod injektovaného selhání v sekvenci dílčích změn transakce. */
type FailurePoint = 'none' | 'update_subscription' | 'update_business' | 'write_audit';

type GrantKind = 'free_trial' | 'comp';

/** Hluboká kopie store pro transakční snapshot/rollback. */
function snapshot(store: Store): Store {
  return {
    subscription: { ...store.subscription },
    business: { ...store.business },
    audit_log: store.audit_log.map((r) => ({ ...r })),
  };
}

function restore(store: Store, snap: Store): void {
  store.subscription = { ...snap.subscription };
  store.business = { ...snap.business };
  store.audit_log = snap.audit_log.map((r) => ({ ...r }));
}

class StepFailure extends Error {}

/**
 * Model jediné transakce `admin_grant_free_trial` / `admin_grant_comp` (migrace
 * 0037). Provede dílčí kroky; při dosažení `failAt` vyhodí výjimku a obnoví
 * původní stav (rollback celé transakce). Vrací `true` při úspěšném commitu.
 */
function runGrantTransaction(
  store: Store,
  params: { kind: GrantKind; trialEnd: string; failAt: FailurePoint },
): boolean {
  const snap = snapshot(store);
  try {
    // (1) update subscriptions
    if (params.failAt === 'update_subscription') {
      throw new StepFailure('update subscriptions selhal');
    }
    store.subscription.status = 'active';
    if (params.kind === 'free_trial') {
      store.subscription.current_period_end = params.trialEnd;
    }
    // comp: current_period_end se nemění

    // (2) update businesses
    if (params.failAt === 'update_business') {
      throw new StepFailure('update businesses selhal');
    }
    store.business.is_published = true;

    // (3) write_audit_log ve stejné transakci
    if (params.failAt === 'write_audit') {
      throw new StepFailure('write_audit_log selhal');
    }
    store.audit_log.push({
      id: `audit-${store.audit_log.length + 1}`,
      action_type: params.kind === 'free_trial' ? 'grant_free_trial' : 'grant_comp',
      target_id: store.subscription.id,
    });

    return true;
  } catch (error) {
    if (error instanceof StepFailure) {
      restore(store, snap); // rollback celé transakce — all-or-nothing
      return false;
    }
    throw error;
  }
}

const initialSubArb = fc.record({
  plan: fc.constantFrom<SubscriptionPlan>('start', 'pokrocily', 'max', null),
  status: fc.constantFrom<SubscriptionStatus>('free', 'active', 'grace_period', 'expired', 'deleted_data'),
  currentPeriodEnd: fc.option(fc.constantFrom('2024-01-15T00:00:00.000Z', '2025-06-30T00:00:00.000Z'), {
    nil: null,
  }),
});

describe('Property 6: atomicita udělení Free_Trial a Comp_Ucet', () => {
  it('selhání v libovolném bodě → úplný rollback; úspěch → cílové hodnoty + 1 audit', () => {
    fc.assert(
      fc.property(
        fc.record({
          kind: fc.constantFrom<GrantKind>('free_trial', 'comp'),
          failAt: fc.constantFrom<FailurePoint>('none', 'update_subscription', 'update_business', 'write_audit'),
          initial: initialSubArb,
          isPublished: fc.boolean(),
          trialEnd: fc.constantFrom('2025-09-30T00:00:00.000Z', '2026-01-31T00:00:00.000Z'),
        }),
        (spec) => {
          const store: Store = {
            subscription: {
              id: 'sub-1',
              business_id: 'biz-1',
              plan: spec.initial.plan,
              status: spec.initial.status,
              current_period_end: spec.initial.currentPeriodEnd,
            },
            business: { id: 'biz-1', is_published: spec.isPublished },
            audit_log: [],
          };

          // NEZÁVISLÝ snapshot původního stavu pro srovnání po rollbacku.
          const before = snapshot(store);

          const committed = runGrantTransaction(store, {
            kind: spec.kind,
            trialEnd: spec.trialEnd,
            failAt: spec.failAt,
          });

          if (spec.failAt !== 'none') {
            // (a) Selhání → úplný rollback: store je shodný s původním (R5.6).
            expect(committed).toBe(false);
            expect(store.subscription).toEqual(before.subscription);
            expect(store.business).toEqual(before.business);
            expect(store.audit_log).toEqual(before.audit_log);
            expect(store.audit_log).toHaveLength(0);
          } else {
            // (b) Úspěch → cílové hodnoty + přesně 1 auditní záznam (Property 2).
            expect(committed).toBe(true);
            expect(store.subscription.status).toBe('active');
            expect(store.business.is_published).toBe(true);
            if (spec.kind === 'free_trial') {
              // Free_Trial nastaví konec zkušebního období (R5.3).
              expect(store.subscription.current_period_end).toBe(spec.trialEnd);
            } else {
              // Comp_Ucet nemění current_period_end (R5.4) — trvalý účet.
              expect(store.subscription.current_period_end).toBe(before.subscription.current_period_end);
            }
            // plan se udělením nemění.
            expect(store.subscription.plan).toBe(before.subscription.plan);
            expect(store.audit_log).toHaveLength(1);
            expect(store.audit_log[0].action_type).toBe(
              spec.kind === 'free_trial' ? 'grant_free_trial' : 'grant_comp',
            );
            expect(store.audit_log[0].target_id).toBe('sub-1');
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
