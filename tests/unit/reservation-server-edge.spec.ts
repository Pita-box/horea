import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit / edge testy server vrstvy multi-service rezervací (task 4.14).
 *
 * Doplňkové k property testům — cílí na konkrétní příklady a hraniční stavy:
 *  - `serviceIds = []` → `loadAvailableSlots` vrací `[]` (R6.4),
 *  - `n = 0` / `n = 11` → konkrétní české hlášky (R5.2, R5.3),
 *  - `auto_approve` (RPC status) true/false → `approved` / `pending` (R7.6),
 *  - ruční rezervace VŽDY `approved` a BEZ potvrzovacího e-mailu klientovi (R15.4),
 *  - `starts_at` se do RPC předává v UTC (R7.4),
 *  - best-effort: selhání e-mailu i logu NEZRUŠÍ úspěšně vytvořenou rezervaci
 *    (R16.4, R16.5).
 *
 * _Requirements: 6.4, 5.2, 5.3, 7.4, 7.6, 15.4, 16.4, 16.5_
 */

const createAdminClientMock = vi.hoisted(() => vi.fn());
const createServerClientMock = vi.hoisted(() => vi.fn());
const loadAvailableSlotsMock = vi.hoisted(() => vi.fn());
const sendConfirmationMock = vi.hoisted(() => vi.fn());
const sendNotificationMock = vi.hoisted(() => vi.fn());
const upsertClientMock = vi.hoisted(() => vi.fn());
const logInfoMock = vi.hoisted(() => vi.fn());
const logWarnMock = vi.hoisted(() => vi.fn());
const logErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: createAdminClientMock }));
vi.mock('@/lib/supabase/server', () => ({ createClient: createServerClientMock }));
vi.mock('@/server/slots/loadAvailableSlots', () => ({ loadAvailableSlots: loadAvailableSlotsMock }));
vi.mock('@/server/EmailNotifier', () => ({
  sendReservationConfirmation: sendConfirmationMock,
  sendReservationNotification: sendNotificationMock,
}));
vi.mock('@/server/ClientUpsertor', () => ({ upsertClientFromReservation: upsertClientMock }));
vi.mock('@/lib/log-server', () => ({
  serverLog: { info: logInfoMock, warn: logWarnMock, error: logErrorMock },
}));

import { validateServiceCount } from '@/lib/reservation/limits';
import { createManualReservation } from '@/server/ManualReservationCreator';
import { createReservation } from '@/server/ReservationCreator';

import {
  buildAdminClient,
  buildInput,
  rpcSuccess,
} from '../properties/_support/reservation-harness';
import { buildManualAdmin, buildManualServerClient } from '../properties/_support/mutation-harness';

const SLOT = '09:00';
const DATE = '2025-06-16';

beforeEach(() => {
  vi.clearAllMocks();
  sendConfirmationMock.mockResolvedValue({ ok: true });
  sendNotificationMock.mockResolvedValue({ ok: true });
  upsertClientMock.mockResolvedValue(undefined);
  loadAvailableSlotsMock.mockResolvedValue([SLOT]);
});

describe('loadAvailableSlots — prázdná množina služeb (R6.4)', () => {
  it('serviceIds = [] vrací prázdný Available_Slot_List bez dotazu do DB', async () => {
    // Skutečná (nemockovaná) implementace — prázdná množina se zkratuje na [].
    const { loadAvailableSlots } = await vi.importActual<
      typeof import('@/server/slots/loadAvailableSlots')
    >('@/server/slots/loadAvailableSlots');

    // Klient, který při jakémkoli dotazu selže — dokazuje, že se vůbec nevolá.
    const explodingClient = {
      from() {
        throw new Error('loadAvailableSlots se neměl dotazovat DB pro prázdnou množinu');
      },
      rpc() {
        throw new Error('loadAvailableSlots se neměl dotazovat DB pro prázdnou množinu');
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const slots = await loadAvailableSlots(explodingClient, {
      businessId: 'biz-1',
      serviceIds: [],
      dateISO: DATE,
    });

    expect(slots).toEqual([]);
  });
});

describe('validateServiceCount — hraniční hlášky (R5.2, R5.3)', () => {
  it('n = 0 → „Vyberte alespoň jednu službu"', () => {
    const result = validateServiceCount(0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('Vyberte alespoň jednu službu');
    }
  });

  it('n = 11 → „Najednou lze vybrat nejvýše 10 služeb"', () => {
    const result = validateServiceCount(11);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('Najednou lze vybrat nejvýše 10 služeb');
    }
  });

  it('hraniční n = 1 a n = 10 jsou přijaty', () => {
    expect(validateServiceCount(1).ok).toBe(true);
    expect(validateServiceCount(10).ok).toBe(true);
  });
});

describe('createReservation — rozsah počtu služeb se vrací jako 400 (R5.2, R5.3)', () => {
  it('prázdná množina služeb → 400 „Vyberte alespoň jednu službu"', async () => {
    createAdminClientMock.mockReturnValue(buildAdminClient());

    const result = await createReservation(buildInput({ serviceIds: [], time: SLOT }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(400);
      expect(result.message).toBe('Vyberte alespoň jednu službu');
    }
  });

  it('11 služeb → 400 „Najednou lze vybrat nejvýše 10 služeb"', async () => {
    createAdminClientMock.mockReturnValue(buildAdminClient());

    const serviceIds = Array.from({ length: 11 }, (_, i) => `svc-${i + 1}`);
    const result = await createReservation(buildInput({ serviceIds, time: SLOT }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(400);
      expect(result.message).toBe('Najednou lze vybrat nejvýše 10 služeb');
    }
  });
});

describe('createReservation — status dle auto_approve (R7.6)', () => {
  it("RPC status 'approved' (auto_approve) → výsledek approved", async () => {
    createAdminClientMock.mockReturnValue(buildAdminClient({ createReservation: rpcSuccess('approved') }));

    const result = await createReservation(buildInput({ time: SLOT }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe('approved');
    }
  });

  it("RPC status 'pending' (bez auto_approve) → výsledek pending", async () => {
    createAdminClientMock.mockReturnValue(buildAdminClient({ createReservation: rpcSuccess('pending') }));

    const result = await createReservation(buildInput({ time: SLOT }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe('pending');
    }
  });
});

describe('createReservation — UTC ukládání starts_at (R7.4)', () => {
  it('p_starts_at předané RPC je UTC ISO (09:00 Praha v létě = 07:00Z)', async () => {
    const admin = buildAdminClient({ createReservation: rpcSuccess('pending') });
    createAdminClientMock.mockReturnValue(admin);

    const result = await createReservation(buildInput({ time: SLOT }));

    expect(result.ok).toBe(true);
    const call = admin.__rpcArgs.find((entry) => entry.fn === 'create_reservation_multi');
    expect(call).toBeDefined();
    const args = (call?.args ?? {}) as { p_starts_at?: string };
    // Europe/Prague je v červnu CEST (UTC+2) ⇒ 09:00 → 07:00 UTC.
    expect(args.p_starts_at).toBe('2025-06-16T07:00:00.000Z');
  });
});

describe('createReservation — best-effort e-mail a log (R16.4, R16.5)', () => {
  it('selhání obou e-mailů i selhání logu nezruší úspěšnou rezervaci', async () => {
    createAdminClientMock.mockReturnValue(buildAdminClient({ createReservation: rpcSuccess('pending') }));
    // Oba transakční e-maily selžou (odmítnutá promise).
    sendConfirmationMock.mockRejectedValue(new Error('resend_down'));
    sendNotificationMock.mockRejectedValue(new Error('resend_down'));
    // I logování selže (vyhodí) — safeLog to musí pohltit.
    logInfoMock.mockImplementation(() => {
      throw new Error('log_sink_down');
    });

    const result = await createReservation(buildInput({ time: SLOT }));

    // Rezervace zůstává vytvořená navzdory selhání e-mailů i logu.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe('pending');
    }
  });
});

describe('createManualReservation — vždy approved, bez e-mailu klientovi (R15.4)', () => {
  it('úspěšná ruční rezervace neodešle klientovi potvrzovací e-mail', async () => {
    createServerClientMock.mockResolvedValue(buildManualServerClient({ autoApprove: false }));
    createAdminClientMock.mockReturnValue(buildManualAdmin({}));

    const result = await createManualReservation({
      serviceIds: ['svc-1'],
      date: DATE,
      time: SLOT,
      clientName: 'Jan Novak',
      clientPhone: '+420704344177',
      clientEmail: 'jan@example.cz',
    });

    expect(result.ok).toBe(true);
    // Manual_Reservation_Creator NEPOSÍLÁ potvrzovací e-mail klientovi (R15.4).
    expect(sendConfirmationMock).not.toHaveBeenCalled();
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it('status je approved nezávisle na auto_approve (routuje na approved-only RPC)', async () => {
    const admin = buildManualAdmin({});
    // I s auto_approve = true se routuje na approved-only multi RPC.
    createServerClientMock.mockResolvedValue(buildManualServerClient({ autoApprove: true }));
    createAdminClientMock.mockReturnValue(admin);

    const result = await createManualReservation({
      serviceIds: ['svc-1'],
      date: DATE,
      time: SLOT,
      clientName: 'Jan Novak',
      clientPhone: '+420704344177',
      clientEmail: '',
    });

    expect(result.ok).toBe(true);
    expect(admin.__rpcCalls).toContain('create_manual_reservation_multi');
    expect(admin.__rpcCalls).not.toContain('create_reservation_multi');
  });
});
