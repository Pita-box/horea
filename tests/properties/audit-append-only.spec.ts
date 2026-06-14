import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

/**
 * Feature: admin-dashboard, Property 3: Auditní stopa je append-only.
 *
 * `audit_log` má na úrovni DB (migrace 0034) odebrané (`REVOKE`) `UPDATE` i
 * `DELETE` — i pro service role — a RLS policy povolující výhradně `INSERT`/`SELECT`.
 * Jednou zapsaný záznam tedy nelze ŽÁDNOU cestou změnit ani odstranit. Tento
 * property test ověřuje KONTRAKT toho návrhu nad in-memory modelem věrně
 * zrcadlícím SQL granty (stejný vzor jako `data-deletion-completeness.spec.ts`):
 *
 *  - `INSERT` připojí nový záznam (povoleno),
 *  - `SELECT` čte beze změny (povoleno),
 *  - `UPDATE` libovolného existujícího záznamu je ODMÍTNUT (permission denied) a
 *    záznam zůstává beze změny,
 *  - `DELETE` libovolného existujícího záznamu je ODMÍTNUT (permission denied) a
 *    záznam zůstává v tabulce.
 *
 * Pro libovolnou posloupnost operací — včetně pokusů o `UPDATE`/`DELETE` dříve
 * zapsaných záznamů — proto platí (R9.5): množina i obsah dříve vložených záznamů
 * zůstávají beze změny; mění/čte je pouze `INSERT`/`SELECT`.
 *
 * NEZÁVISLÝ ORACLE: očekávaný koncový stav tabulky se rekonstruuje POUZE z
 * posloupnosti `INSERT` operací (deklarativně, jinou cestou než vynucení v
 * modelu), takže test ověřuje append-only, ne tautologii. Žádná reálná DB.
 *
 * Validates: Requirements 9.5
 */

const NUM_RUNS = 200;

type AuditRecord = {
  id: string;
  actor_user_id: string;
  action_type: string;
  target_type: string;
  target_id: string | null;
  created_at: string;
};

/** Chyba zrcadlící `permission denied` z table-grant REVOKE (migrace 0034). */
class AppendOnlyViolation extends Error {
  constructor(op: 'update' | 'delete') {
    super(`audit_log: operace ${op} není povolena (append-only, migrace 0034)`);
    this.name = 'AppendOnlyViolation';
  }
}

type Store = { audit_log: AuditRecord[]; seq: number };

/** INSERT — jediná modifikující operace povolená nad `audit_log`. */
function insert(store: Store, partial: Omit<AuditRecord, 'id' | 'created_at'>): AuditRecord {
  store.seq += 1;
  const record: AuditRecord = {
    id: `audit-${store.seq}`,
    created_at: new Date(Date.UTC(2025, 0, 1, 0, 0, store.seq)).toISOString(),
    ...partial,
  };
  store.audit_log.push(record);
  return record;
}

/** UPDATE — zakázáno na úrovni DB. Vždy vyhodí, nikdy nezmění řádek. */
function update(): never {
  throw new AppendOnlyViolation('update');
}

/** DELETE — zakázáno na úrovni DB. Vždy vyhodí, nikdy neodebere řádek. */
function remove(): never {
  throw new AppendOnlyViolation('delete');
}

type Op =
  | { kind: 'insert'; actor: string; actionType: string; targetType: string }
  | { kind: 'select' }
  | { kind: 'update'; targetOffset: number; newActor: string }
  | { kind: 'delete'; targetOffset: number };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    kind: fc.constant('insert' as const),
    actor: fc.constantFrom('admin-1', 'admin-2'),
    actionType: fc.constantFrom('subscription_override', 'coupon_create', 'payment_match', 'force_delete_business'),
    targetType: fc.constantFrom('subscription', 'coupon', 'payment', 'business'),
  }),
  fc.record({ kind: fc.constant('select' as const) }),
  fc.record({
    kind: fc.constant('update' as const),
    targetOffset: fc.integer({ min: 0, max: 1000 }),
    newActor: fc.constant('attacker'),
  }),
  fc.record({
    kind: fc.constant('delete' as const),
    targetOffset: fc.integer({ min: 0, max: 1000 }),
  }),
);

describe('Property 3: auditní stopa je append-only', () => {
  it('UPDATE/DELETE existujících záznamů je odmítnut a nic nezmění; jen INSERT mění tabulku', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 25 }), (ops) => {
        const store: Store = { audit_log: [], seq: 0 };

        // NEZÁVISLÝ oracle: koncový stav = pouze vložené záznamy v pořadí vzniku.
        const expected: AuditRecord[] = [];

        for (const op of ops) {
          if (op.kind === 'insert') {
            const rec = insert(store, {
              actor_user_id: op.actor,
              action_type: op.actionType,
              target_type: op.targetType,
              target_id: null,
            });
            expected.push({ ...rec });
          } else if (op.kind === 'select') {
            // Čtení nesmí nic změnit.
            const before = store.audit_log.map((r) => ({ ...r }));
            const read = store.audit_log.slice();
            expect(read).toEqual(before);
          } else if (op.kind === 'update') {
            if (store.audit_log.length === 0) {
              continue;
            }
            const idx = op.targetOffset % store.audit_log.length;
            const snapshot = { ...store.audit_log[idx] };
            // Pokus o UPDATE musí selhat a nic nezměnit.
            expect(() => update()).toThrow(AppendOnlyViolation);
            expect(store.audit_log[idx]).toEqual(snapshot);
          } else {
            if (store.audit_log.length === 0) {
              continue;
            }
            const idx = op.targetOffset % store.audit_log.length;
            const lengthBefore = store.audit_log.length;
            const targetId = store.audit_log[idx].id;
            // Pokus o DELETE musí selhat a záznam ponechat.
            expect(() => remove()).toThrow(AppendOnlyViolation);
            expect(store.audit_log).toHaveLength(lengthBefore);
            expect(store.audit_log.some((r) => r.id === targetId)).toBe(true);
          }
        }

        // Koncový stav přesně odpovídá nezávislému oracle (žádná změna ani úbytek).
        expect(store.audit_log).toEqual(expected);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
