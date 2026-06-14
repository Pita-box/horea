/**
 * Integrační test (VOLITELNÝ) — advisory lock race při úpravě rezervace
 * (R9.3, R9.4).
 *
 * Ověřuje DB-level atomicitu úpravy proti REÁLNÉMU Postgresu: dvě souběžné úpravy
 * dvou různých rezervací téhož podniku, obě cílící na STEJNÝ volný slot, nesmí
 * obě uspět. `pg_advisory_xact_lock(hashtext(business_id))` v RPC `edit_reservation`
 * (migrace 0021) souběh serializuje a overlap re-check pod zámkem (s vyloučením
 * sebe sama) zajistí, že právě jedna úprava projde a druhá vrátí konflikt (→ 409).
 *
 * Voláme přímo RPC `edit_reservation` přes service-role klienta (ne TS
 * `editReservation`), abychom dostali deterministický DB-level souběh: advisory
 * lock i overlap re-check žijí v DB funkci, takže paralelní `Promise.all` dvou
 * RPC volání je nejvěrnější reprodukce závodu. Server action `Reservation_Editor`
 * navíc běží pod Next.js cookies kontextem, který v test runneru není.
 *
 * Běží čistě přes service-role klienta (RLS zde nezkoumáme). Bez nakonfigurovaného
 * testovacího Supabase se blok přeskočí (`describe.skipIf`).
 *
 * _Requirements: 9.3, 9.4_
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getServiceRoleClient, hasIntegrationEnv } from './supabase-test-client';

const TEST_PASSWORD = 'Integration-Test-Heslo-123';

/** Cílový volný slot, na který obě úpravy míří. */
const TARGET_STARTS_AT = '2099-06-15T14:00:00Z';
const TARGET_ENDS_AT = '2099-06-15T15:00:00Z';

type EditReservationRpcRow = {
  updated: boolean;
  conflict: boolean;
  invalid: boolean;
};

/** RPC vrací množinu řádků; bere první (a jediný) řádek bez ohledu na tvar. */
function firstRow(data: unknown): EditReservationRpcRow | undefined {
  return Array.isArray(data) ? data[0] : (data as EditReservationRpcRow | undefined);
}

describe.skipIf(!hasIntegrationEnv)('Advisory lock race při úpravě rezervace', () => {
  let admin: SupabaseClient;
  let userId: string;
  let businessId: string;
  let serviceId: string;
  let reservationA: string;
  let reservationB: string;

  beforeAll(async () => {
    admin = getServiceRoleClient();
    const unique = crypto.randomUUID().slice(0, 8);
    const email = `editrace-${unique}@example.test`;

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

    // Podnik bez paralelních slotů → overlap re-check je aktivní.
    const { data: business, error: businessError } = await admin
      .from('businesses')
      .insert({
        owner_user_id: userId,
        slug: `editrace-${unique}`,
        name: 'Podnik úprava závod',
        type: 'kadernik',
        allow_parallel_slots: false,
      })
      .select('id')
      .single<{ id: string }>();

    if (businessError || !business) {
      throw new Error('Nepodařilo se vytvořit podnik.');
    }

    businessId = business.id;

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

    // Dvě aktivní rezervace na RŮZNÝCH, nekolidujících slotech.
    const insertReservation = async (startsAt: string, endsAt: string): Promise<string> => {
      const { data, error } = await admin
        .from('reservations')
        .insert({
          business_id: businessId,
          service_id: serviceId,
          client_name: 'Závodník',
          client_email: 'editrace@example.test',
          starts_at: startsAt,
          ends_at: endsAt,
          status: 'approved',
        })
        .select('id')
        .single<{ id: string }>();
      if (error || !data) {
        throw new Error('Nepodařilo se vytvořit rezervaci.');
      }
      return data.id;
    };

    reservationA = await insertReservation('2099-06-15T08:00:00Z', '2099-06-15T09:00:00Z');
    reservationB = await insertReservation('2099-06-15T10:00:00Z', '2099-06-15T11:00:00Z');
  });

  afterAll(async () => {
    if (businessId) {
      await admin.from('businesses').delete().eq('id', businessId);
    }
    if (userId) {
      await admin.from('users').delete().eq('id', userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it('dvě souběžné úpravy na stejný slot: jedna uspěje, druhá je konflikt', async () => {
    const callEdit = (reservationId: string) =>
      admin.rpc('edit_reservation', {
        p_reservation_id: reservationId,
        p_business_id: businessId,
        p_service_id: serviceId,
        p_starts_at: TARGET_STARTS_AT,
        p_ends_at: TARGET_ENDS_AT,
      });

    // Paralelní souběh — advisory lock v DB funkci souběh serializuje.
    const [resA, resB] = await Promise.all([callEdit(reservationA), callEdit(reservationB)]);

    expect(resA.error).toBeNull();
    expect(resB.error).toBeNull();

    const rowA = firstRow(resA.data);
    const rowB = firstRow(resB.data);
    expect(rowA).toBeDefined();
    expect(rowB).toBeDefined();

    const updates = [rowA, rowB].filter((row) => row?.updated === true);
    const conflicts = [rowA, rowB].filter((row) => row?.conflict === true);

    // Právě jedna úprava proběhla a právě jedna skončila konfliktem (→ 409).
    expect(updates).toHaveLength(1);
    expect(conflicts).toHaveLength(1);

    // Žádné volání nesmí být invalid (obě rezervace byly approved a patří podniku).
    expect([rowA, rowB].filter((row) => row?.invalid === true)).toHaveLength(0);

    // V DB sedí na cílovém slotu právě jedna rezervace.
    const { count } = await admin
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('starts_at', TARGET_STARTS_AT);
    expect(count).toBe(1);
  });
});
