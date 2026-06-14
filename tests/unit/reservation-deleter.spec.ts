import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReservationStatus } from '@/lib/reservations/labels';

/**
 * Příkladový test `Reservation_Deleter` (úkol 9.7 — R10.3, R10.4).
 *
 * Ověřuje, že hard delete uspěje z KAŽDÉHO ze čtyř stavů (`pending`, `approved`,
 * `rejected`, `cancelled`) — žádný stav nepodmiňuje smazatelnost (R10.3) — a že
 * se přitom NEODESÍLÁ žádný e-mail (R10.4). E-mailovou vrstvu mockujeme a
 * tvrdíme, že nebyla nikdy volána.
 */

// Stav nakonfigurovatelný per test + zachycené volání delete.
const state = vi.hoisted(() => ({
  deletedRow: null as { id: string; business_id: string } | null,
  deleteCalls: 0,
}));

const selectMock = vi.hoisted(() =>
  vi.fn(async () => ({ data: state.deletedRow ? [state.deletedRow] : [], error: null })),
);

const fromMock = vi.hoisted(() =>
  vi.fn(() => ({
    // .delete().eq().select()
    delete: () => {
      state.deleteCalls += 1;
      return { eq: () => ({ select: selectMock }) };
    },
  })),
);

const dispatchMock = vi.hoisted(() => vi.fn(async () => ({ ok: true })));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from: fromMock,
  })),
}));

vi.mock('@/lib/log-server', () => ({
  serverLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// E-mailová vrstva — nesmí být volána (R10.4). Mock je sdílený dispatcher;
// `Reservation_Deleter` ho neimportuje, takže spy zůstane nevolaný.
vi.mock('@/lib/email/dispatcher', () => ({
  dispatchTransactionalEmail: dispatchMock,
}));

import { deleteReservation } from '@/server/ReservationDeleter';

const ALL_STATUSES: ReservationStatus[] = ['pending', 'approved', 'rejected', 'cancelled'];

beforeEach(() => {
  state.deletedRow = null;
  state.deleteCalls = 0;
  selectMock.mockClear();
  fromMock.mockClear();
  dispatchMock.mockClear();
});

describe('Reservation_Deleter — hard delete z libovolného stavu (R10.3)', () => {
  for (const status of ALL_STATUSES) {
    it(`smaže rezervaci ve stavu „${status}" a neodešle e-mail`, async () => {
      // DB vrací smazaný řádek bez ohledu na předchozí stav (status nepodmiňuje delete).
      state.deletedRow = { id: `res-${status}`, business_id: 'biz-1' };

      const result = await deleteReservation(`res-${status}`);

      expect(result).toEqual({ ok: true });
      expect(state.deleteCalls).toBe(1);
      // Žádný e-mail klientovi (R10.4).
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  }

  it('vrátí chybu, když delete neovlivní žádný řádek (neexistuje / cizí podnik)', async () => {
    state.deletedRow = null;

    const result = await deleteReservation('res-missing');

    expect(result.ok).toBe(false);
    expect(dispatchMock).not.toHaveBeenCalled();
  });
});
