/**
 * Integrační test (VOLITELNÝ) — race condition na stejný slot (R9.7).
 *
 * Ověřuje DB-level atomicitu vytvoření rezervace proti REÁLNÉMU Postgresu: dvě
 * souběžné rezervace STEJNÉHO slotu STEJNÉHO podniku (při `allow_parallel_slots
 * = false`) nesmí obě uspět. Serializaci zajišťuje `pg_advisory_xact_lock` +
 * overlap re-check uvnitř funkce `create_reservation` (migrace 0015).
 *
 * Voláme přímo RPC `create_reservation` přes service-role klienta (ne TS
 * `createReservation`), abychom dostali deterministický DB-level souběh: advisory
 * lock i overlap re-check žijí v DB funkci, takže paralelní `Promise.all` dvou
 * RPC volání je nejvěrnější reprodukce závodu. Property test 7.4 ověřuje pouze
 * logiku nad mock DB — tady jde o skutečné chování DB pod zámkem.
 *
 * Běží čistě přes service-role klienta (RLS zde nezkoumáme). Bez nakonfigurovaného
 * testovacího Supabase se blok přeskočí (`describe.skipIf`).
 *
 * _Requirements: 9.7_
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getServiceRoleClient, hasIntegrationEnv } from './supabase-test-client';

const TEST_PASSWORD = 'Integration-Test-Heslo-123';

/** Pevné budoucí datum testovaného slotu (Europe/Prague ~ UTC pro účely testu). */
const SLOT_DATE = '2099-06-15';
const STARTS_AT = `${SLOT_DATE}T08:00:00Z`;
const ENDS_AT = `${SLOT_DATE}T09:00:00Z`;

type CreateReservationRpcRow = {
  reservation_id: string | null;
  status: string | null;
  conflict: boolean;
  not_published: boolean;
};

/** Po-first index dne v týdnu (0 = Po … 6 = Ne) — shodně s `loadAvailableSlots`. */
function poFirstWeekday(dateISO: string): number {
  const [year, month, day] = dateISO.split('-').map(Number);
  const sundayFirst = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (sundayFirst + 6) % 7;
}

/** RPC vrací množinu řádků; bere první (a jediný) řádek bez ohledu na tvar. */
function firstRow(data: unknown): CreateReservationRpcRow | undefined {
  return Array.isArray(data) ? data[0] : (data as CreateReservationRpcRow | undefined);
}

describe.skipIf(!hasIntegrationEnv)('Race condition na stejný slot', () => {
  // Klienta vytváříme až v beforeAll — tělo describe se při skipu sice vyhodnotí
  // (kvůli sběru testů), ale getServiceRoleClient by bez env vyhodil výjimku.
  let admin: SupabaseClient;
  let userId: string;
  let businessId: string;
  let serviceId: string;

  beforeAll(async () => {
    admin = getServiceRoleClient();
    const unique = crypto.randomUUID().slice(0, 8);
    const email = `race-${unique}@example.test`;

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
    });

    if (createError || !created.user) {
      throw new Error('Nepodařilo se vytvořit testovacího uživatele.');
    }

    userId = created.user.id;

    const { error: usersError } = await admin.from('users').insert({ id: userId, email });
    if (usersError) {
      throw new Error('Nepodařilo se vytvořit profil uživatele.');
    }

    // Publikovaný podnik bez paralelních slotů (Published_Business).
    const { data: business, error: businessError } = await admin
      .from('businesses')
      .insert({
        owner_user_id: userId,
        slug: `race-${unique}`,
        name: 'Podnik závod',
        type: 'kadernik',
        is_published: true,
        allow_parallel_slots: false,
        auto_approve_reservations: true,
      })
      .select('id')
      .single<{ id: string }>();

    if (businessError || !business) {
      throw new Error('Nepodařilo se vytvořit podnik.');
    }

    businessId = business.id;

    // Aktivní předplatné → business je Published_Business (is_business_published).
    const { error: subscriptionError } = await admin
      .from('subscriptions')
      .insert({ business_id: businessId, status: 'active' });

    if (subscriptionError) {
      throw new Error('Nepodařilo se vytvořit předplatné.');
    }

    const { data: service, error: serviceError } = await admin
      .from('services')
      .insert({
        business_id: businessId,
        name: 'Stříhání',
        duration_minutes: 60,
        price_czk: 500,
      })
      .select('id')
      .single<{ id: string }>();

    if (serviceError || !service) {
      throw new Error('Nepodařilo se vytvořit službu.');
    }

    serviceId = service.id;

    // Otevírací doba pro den testovaného slotu (realistický setup; samotná RPC
    // otevírací dobu neověřuje, grid kontroluje TS vrstva před voláním).
    const { error: hoursError } = await admin.from('opening_hours').insert({
      business_id: businessId,
      day_of_week: poFirstWeekday(SLOT_DATE),
      opens_at: '08:00',
      closes_at: '18:00',
    });

    if (hoursError) {
      throw new Error('Nepodařilo se vytvořit otevírací dobu.');
    }
  });

  afterAll(async () => {
    // Smazání podniku kaskádně odstraní subscription, service, opening_hours i
    // rezervace; pak profil a auth uživatele.
    if (businessId) {
      await admin.from('businesses').delete().eq('id', businessId);
    }
    if (userId) {
      await admin.from('users').delete().eq('id', userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it('dvě souběžné rezervace stejného slotu: právě jedna uspěje, druhá je konflikt', async () => {
    const callRpc = () =>
      admin.rpc('create_reservation', {
        p_business_id: businessId,
        p_service_id: serviceId,
        p_starts_at: STARTS_AT,
        p_ends_at: ENDS_AT,
        p_client_name: 'Závodník',
        p_client_phone: '+420704344177',
        p_client_email: 'race@example.test',
        p_note: null,
      });

    // Paralelní souběh — advisory lock v DB funkci souběh serializuje.
    const [resA, resB] = await Promise.all([callRpc(), callRpc()]);

    expect(resA.error).toBeNull();
    expect(resB.error).toBeNull();

    const rowA = firstRow(resA.data);
    const rowB = firstRow(resB.data);
    expect(rowA).toBeDefined();
    expect(rowB).toBeDefined();

    const successes = [rowA, rowB].filter((row) => Boolean(row?.reservation_id));
    const conflicts = [rowA, rowB].filter((row) => row?.conflict === true);

    // Právě jeden úspěch (vrátil reservation_id) a právě jeden konflikt.
    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(1);

    // Konfliktní řádek nesmí mít přiřazené reservation_id.
    expect(conflicts[0]?.reservation_id).toBeNull();

    // V DB existuje právě 1 rezervace pro daný slot.
    const { count } = await admin
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('starts_at', STARTS_AT);

    expect(count).toBe(1);
  });
});
