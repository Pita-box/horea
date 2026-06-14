import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AttendanceStatus } from '@/lib/reservations/labels';

/**
 * Příkladový test serverové časové brány docházky (úkol 7.6 — R11.3, R11.4, R11.5).
 *
 * Ověřuje, že `Attendance_Marker`:
 *  - NEPOVOLÍ označení, dokud `now() <= starts_at` (R11.4) — brána běží na serveru,
 *  - POVOLÍ označení, jakmile `now() > starts_at` (R11.3),
 *  - umožní přepínat mezi `attended` / `no_show` i zpět na `null` (R11.5).
 *
 * Supabase klient je nahrazen lehkým mockem (stejný styl jako server testy
 * `ClientUpsertor` / `register/actions`), takže testujeme čistě logiku brány.
 */

const HOUR_MS = 3_600_000;

// Konfigurovatelný `starts_at` načteného řádku a zachycený UPDATE.
const state = vi.hoisted(() => ({
  startsAt: '',
  updatePayload: null as { attendance: AttendanceStatus } | null,
  updateCalls: 0,
}));

const updateEqMock = vi.hoisted(() =>
  vi.fn(async () => {
    state.updateCalls += 1;
    return { error: null };
  }),
);

const fromMock = vi.hoisted(() =>
  vi.fn(() => ({
    // Načtení řádku: .select().eq().maybeSingle()
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: { id: 'res-1', business_id: 'biz-1', starts_at: state.startsAt },
          error: null,
        }),
      }),
    }),
    // UPDATE: .update().eq()
    update: (payload: { attendance: AttendanceStatus }) => {
      state.updatePayload = payload;
      return { eq: updateEqMock };
    },
  })),
);

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from: fromMock,
  })),
}));

vi.mock('@/lib/log-server', () => ({
  serverLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { markAttendance } from '@/server/AttendanceMarker';

const BEFORE_START_MESSAGE = 'Docházku lze označit až po začátku termínu';

beforeEach(() => {
  state.updatePayload = null;
  state.updateCalls = 0;
  updateEqMock.mockClear();
  fromMock.mockClear();
});

describe('Attendance_Marker — časová brána (R11.3, R11.4)', () => {
  it('nepovolí docházku, dokud now() <= starts_at (termín ještě nezačal)', async () => {
    state.startsAt = new Date(Date.now() + HOUR_MS).toISOString();

    const result = await markAttendance('res-1', 'attended');

    expect(result).toEqual({ ok: false, message: BEFORE_START_MESSAGE });
    expect(state.updateCalls).toBe(0); // žádný zápis
  });

  it('povolí docházku, jakmile now() > starts_at (termín už začal)', async () => {
    state.startsAt = new Date(Date.now() - HOUR_MS).toISOString();

    const result = await markAttendance('res-1', 'attended');

    expect(result).toEqual({ ok: true });
    expect(state.updatePayload).toEqual({ attendance: 'attended' });
  });
});

describe('Attendance_Marker — přepínání hodnot (R11.5)', () => {
  beforeEach(() => {
    state.startsAt = new Date(Date.now() - HOUR_MS).toISOString();
  });

  it('umožní attended → no_show → null', async () => {
    await expect(markAttendance('res-1', 'attended')).resolves.toEqual({ ok: true });
    expect(state.updatePayload).toEqual({ attendance: 'attended' });

    await expect(markAttendance('res-1', 'no_show')).resolves.toEqual({ ok: true });
    expect(state.updatePayload).toEqual({ attendance: 'no_show' });

    await expect(markAttendance('res-1', null)).resolves.toEqual({ ok: true });
    expect(state.updatePayload).toEqual({ attendance: null });
  });
});
