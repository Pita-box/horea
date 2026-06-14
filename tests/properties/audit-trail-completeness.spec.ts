import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

/**
 * Feature: admin-dashboard, Property 2: Úplnost auditní stopy.
 *
 * Každá citlivá administrátorská akce (override / úprava předplatného, udělení
 * Free_Trial, udělení Comp_Ucet, pozastavení podniku, vynucené smazání podniku,
 * vytvoření / úprava / deaktivace / smazání kupónu, spárování platby) žije v
 * plpgsql RPC, která UVNITŘ své transakce volá `write_audit_log` (migrace 0035) —
 * právě jednou. Tento property test ověřuje KONTRAKT toho návrhu nad in-memory
 * modelem věrně zrcadlícím SQL (stejný vzor jako `data-deletion-completeness.spec.ts`):
 *
 *  - `write_audit_log` je modelováno věrně dle migrace 0035 — vyžaduje
 *    `action_type` i `target_type` (jinak vyhodí výjimku jako `errcode 22023`),
 *    vloží PŘESNĚ jeden řádek do `audit_log` s povinnými poli a vrátí jeho `id`,
 *  - každá akční RPC se chová jako v migracích 0036–0040 / 0038: pokud cílový
 *    objekt existuje (resp. u `coupon_create` se vždy vytvoří), provede změnu a
 *    zavolá `write_audit_log` jednou; pokud cíl neexistuje, vrátí `not_found` a
 *    auditní záznam NEvznikne.
 *
 * Pro libovolnou posloupnost citlivých akcí proto platí (R5.7, R6.4, R7.8, R8.5,
 * R9.1, R9.2): každá ÚSPĚŠNÁ akce vytvoří přesně jeden nový Audit_Log_Zaznam s
 * povinnými poli (actor, action_type, target_type, target_id, created_at), zatímco
 * neúspěšná (not_found) nevytvoří žádný.
 *
 * NEZÁVISLÝ ORACLE: očekávaný počet zápisů i hodnoty polí počítá generátor
 * deklarativně (`expectedWrite`) jinou cestou než imperativní RPC runner, takže
 * test ověřuje completeness, ne tautologii. Žádná reálná DB.
 *
 * Validates: Requirements 5.7, 6.4, 7.8, 8.5, 9.1, 9.2
 */

const NUM_RUNS = 200;

/** Typ citlivé akce — odpovídá `AuditActionType` v `lib/admin/audit-logger.ts`. */
type AuditActionType =
  | 'subscription_override'
  | 'grant_free_trial'
  | 'grant_comp'
  | 'suspend_business'
  | 'force_delete_business'
  | 'coupon_create'
  | 'coupon_update'
  | 'coupon_deactivate'
  | 'coupon_delete'
  | 'payment_match';

/** Typ cílového objektu — odpovídá `AuditTargetType`. */
type AuditTargetType = 'subscription' | 'business' | 'coupon' | 'payment';

const ALL_ACTIONS: AuditActionType[] = [
  'subscription_override',
  'grant_free_trial',
  'grant_comp',
  'suspend_business',
  'force_delete_business',
  'coupon_create',
  'coupon_update',
  'coupon_deactivate',
  'coupon_delete',
  'payment_match',
];

/** Mapování typu akce na typ cílového objektu (dle Requirement 9.1/9.2). */
const ACTION_TARGET: Record<AuditActionType, AuditTargetType> = {
  subscription_override: 'subscription',
  grant_free_trial: 'subscription',
  grant_comp: 'subscription',
  suspend_business: 'business',
  force_delete_business: 'business',
  coupon_create: 'coupon',
  coupon_update: 'coupon',
  coupon_deactivate: 'coupon',
  coupon_delete: 'coupon',
  payment_match: 'payment',
};

type AuditRecord = {
  id: string;
  actor_user_id: string;
  action_type: AuditActionType;
  target_type: AuditTargetType;
  target_id: string | null;
  before: unknown;
  after: unknown;
  created_at: string;
};

type Store = {
  audit_log: AuditRecord[];
  // Pevné „existující" cíle (zrcadlí řádky v DB). Membership rozhoduje o tom,
  // zda akční RPC najde cíl a zapíše audit.
  subscriptions: Set<string>;
  businesses: Set<string>;
  coupons: Set<string>;
  payments: Set<string>;
  seq: number;
};

function setFor(store: Store, targetType: AuditTargetType): Set<string> {
  switch (targetType) {
    case 'subscription':
      return store.subscriptions;
    case 'business':
      return store.businesses;
    case 'coupon':
      return store.coupons;
    case 'payment':
      return store.payments;
  }
}

/**
 * Model `write_audit_log` (migrace 0035): vyžaduje action_type i target_type,
 * vloží PŘESNĚ jeden řádek s vygenerovaným `id` a `created_at` a vrátí `id`.
 */
function writeAuditLog(
  store: Store,
  entry: Omit<AuditRecord, 'id' | 'created_at'>,
): string {
  if (!entry.action_type || !entry.target_type) {
    throw new Error('Auditní záznam vyžaduje action_type i target_type'); // errcode 22023
  }
  store.seq += 1;
  const record: AuditRecord = {
    id: `audit-${store.seq}`,
    created_at: new Date(Date.UTC(2025, 0, 1, 0, 0, store.seq)).toISOString(),
    ...entry,
  };
  store.audit_log.push(record);
  return record.id;
}

type Action = {
  actionType: AuditActionType;
  actor: string;
  targetId: string;
  /** Zda cíl existuje (resp. u coupon_create se vždy vytvoří). */
  exists: boolean;
};

/**
 * Model akční RPC (override / grant / suspend / force-delete / coupon CRUD /
 * payment match): pokud cíl existuje (nebo coupon_create), provede změnu a ve
 * STEJNÉ transakci jednou zavolá `write_audit_log`. Jinak vrátí not_found a audit
 * nevznikne. Vrací `true`, pokud byl zapsán auditní záznam.
 */
function runAction(store: Store, action: Action): boolean {
  const targetType = ACTION_TARGET[action.actionType];

  // coupon_create vždy vytvoří nový kupón → cíl existuje, before je null.
  const proceed =
    action.actionType === 'coupon_create' ? true : setFor(store, targetType).has(action.targetId);

  if (!proceed) {
    return false; // not_found → žádný auditní záznam
  }

  // (Změna doménového objektu zde není předmětem Property 2 — modelujeme pouze
  //  to, že úspěšná akce zapíše audit. Samotné efekty ověřují jiné property/unit
  //  testy: 11.2 atomicita, 12.2 force-delete, 14.3 grant hodnoty atd.)
  writeAuditLog(store, {
    actor_user_id: action.actor,
    action_type: action.actionType,
    target_type: targetType,
    target_id: action.targetId,
    before: null,
    after: null,
  });
  return true;
}

const POOL: Record<AuditTargetType, string[]> = {
  subscription: ['sub-1', 'sub-2', 'sub-3'],
  business: ['biz-1', 'biz-2'],
  coupon: ['cou-1', 'cou-2'],
  payment: ['pay-1', 'pay-2'],
};

const actionArb = fc.record({
  actionType: fc.constantFrom(...ALL_ACTIONS),
  actorIdx: fc.integer({ min: 1, max: 3 }),
  exists: fc.boolean(),
  poolIdx: fc.integer({ min: 0, max: 2 }),
});

describe('Property 2: úplnost auditní stopy', () => {
  it('každá úspěšná citlivá akce zapíše přesně 1 auditní záznam s povinnými poli; neúspěšná žádný', () => {
    fc.assert(
      fc.property(fc.array(actionArb, { maxLength: 20 }), (rawActions) => {
        const store: Store = {
          audit_log: [],
          subscriptions: new Set(POOL.subscription),
          businesses: new Set(POOL.business),
          coupons: new Set(POOL.coupon),
          payments: new Set(POOL.payment),
          seq: 0,
        };

        // Sestavení akcí s deterministickým cílem dle `exists`.
        const actions: Action[] = rawActions.map((a, i) => {
          const targetType = ACTION_TARGET[a.actionType];
          let targetId: string;
          if (a.actionType === 'coupon_create') {
            targetId = `cou-new-${i}`; // nově vytvořený kupón
          } else if (a.exists) {
            const pool = POOL[targetType];
            targetId = pool[a.poolIdx % pool.length];
          } else {
            targetId = `missing-${i}`; // neexistující cíl
          }
          return { actionType: a.actionType, actor: `admin-${a.actorIdx}`, targetId, exists: a.exists };
        });

        // NEZÁVISLÝ oracle: úspěch = coupon_create NEBO cíl existoval.
        let expectedTotal = 0;

        for (let i = 0; i < actions.length; i += 1) {
          const action = actions[i];
          const expectedWrite = action.actionType === 'coupon_create' || action.exists;

          const countBefore = store.audit_log.length;
          const wrote = runAction(store, action);
          const delta = store.audit_log.length - countBefore;

          // (a) Přesně 1 nový záznam při úspěchu, 0 při neúspěchu (R9.1).
          expect(wrote).toBe(expectedWrite);
          expect(delta).toBe(expectedWrite ? 1 : 0);

          if (expectedWrite) {
            expectedTotal += 1;
            const rec = store.audit_log[store.audit_log.length - 1];
            // (b) Povinná pole každého záznamu (R9.2).
            expect(rec.actor_user_id).toBe(action.actor);
            expect(rec.actor_user_id.length).toBeGreaterThan(0);
            expect(rec.action_type).toBe(action.actionType);
            expect(rec.target_type).toBe(ACTION_TARGET[action.actionType]);
            expect(rec.target_id).toBe(action.targetId);
            expect(rec.target_id).not.toBeNull();
            expect(typeof rec.created_at).toBe('string');
            expect(Number.isNaN(Date.parse(rec.created_at))).toBe(false);
          }
        }

        // (c) Celkový počet záznamů = počet úspěšných akcí (žádné chybějící ani duplicitní).
        expect(store.audit_log.length).toBe(expectedTotal);
        // (d) Unikátní id každého záznamu (append-only růst).
        expect(new Set(store.audit_log.map((r) => r.id)).size).toBe(store.audit_log.length);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
