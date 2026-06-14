/**
 * Integrační test (VOLITELNÝ) — rozsah CSV exportu (R17.4, R17.5).
 *
 * Ověřuje proti REÁLNÉMU Postgresu dvě vlastnosti `CSV_Exporter`u:
 *  - **Izolace na business_id majitele (R17.4):** export pod uživatelským JWT
 *    majitele (RLS `tenant_isolation`) vidí výhradně rezervace svého podniku;
 *    rezervace cizího podniku se do exportu nikdy nedostanou.
 *  - **Všechny vyfiltrované řádky bez ohledu na stránkování UI (R17.5):** jedna
 *    „stránka" seznamu je omezená na 100 řádků, ale export přečte VŠECHNY
 *    vyfiltrované řádky (po dávkách) — i když jich je nad limit stránky.
 *
 * Čteme pod uživatelským JWT (bearer klient) stejnými predikáty + dávkovým
 * čtením jako `exportReservationsCsv` (server action sama běží pod Next.js cookies
 * kontextem, který v test runneru není). Výsledné řádky protáhneme REÁLNÝM
 * generátorem `generateCsvLines` z `CsvExporter`u a ověříme úplnost výstupu.
 *
 * Seed přes service-role klienta. Bez nakonfigurovaného testovacího Supabase se
 * blok přeskočí (`describe.skipIf`).
 *
 * _Requirements: 17.4, 17.5_
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { RESERVATIONS_PAGE_SIZE } from '@/lib/reservations/filters';
import { CSV_COLUMNS, generateCsvLines } from '@/server/CsvExporter';

import {
  getServiceRoleClient,
  hasRlsIntegrationEnv,
  signInAsUser,
} from './supabase-test-client';

const TEST_PASSWORD = 'Integration-Test-Heslo-123';

/** Počet rezervací majitele nad limit stránky pro ověření R17.5. */
const OWNER_RESERVATION_COUNT = RESERVATIONS_PAGE_SIZE + 30;
const FOREIGN_RESERVATION_COUNT = 5;

/** Shodný select jako CsvExporter (řádek s vnořeným názvem služby). */
const SELECT_COLUMNS =
  'id,starts_at,ends_at,status,attendance,client_name,client_phone,client_email,note,created_at,services(name)';

const FETCH_BATCH_SIZE = 1000;

describe.skipIf(!hasRlsIntegrationEnv)('Rozsah CSV exportu', () => {
  const createdUserIds: string[] = [];
  const createdBusinessIds: string[] = [];

  let admin: SupabaseClient;
  let owner: SupabaseClient;
  let ownerBusinessId: string;

  async function seedBusiness(label: string): Promise<{
    userId: string;
    email: string;
    businessId: string;
    serviceId: string;
  }> {
    const unique = crypto.randomUUID().slice(0, 8);
    const email = `csvscope-${label}-${unique}@example.test`;

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
    });

    if (createError || !created.user) {
      throw new Error('Nepodařilo se vytvořit testovacího uživatele.');
    }

    const userId = created.user.id;
    createdUserIds.push(userId);

    const { error: usersError } = await admin.from('users').insert({ id: userId, email });
    if (usersError) {
      throw new Error('Nepodařilo se vytvořit profil uživatele.');
    }

    const { data: business, error: businessError } = await admin
      .from('businesses')
      .insert({
        owner_user_id: userId,
        slug: `csvscope-${label}-${unique}`,
        name: `Podnik ${label}`,
        type: 'kadernik',
      })
      .select('id')
      .single<{ id: string }>();

    if (businessError || !business) {
      throw new Error('Nepodařilo se vytvořit podnik.');
    }

    createdBusinessIds.push(business.id);

    const { data: service, error: serviceError } = await admin
      .from('services')
      .insert({
        business_id: business.id,
        name: `Služba ${label}`,
        duration_minutes: 30,
        price_czk: 250,
      })
      .select('id')
      .single<{ id: string }>();

    if (serviceError || !service) {
      throw new Error('Nepodařilo se vytvořit službu.');
    }

    return { userId, email, businessId: business.id, serviceId: service.id };
  }

  async function seedReservations(
    businessId: string,
    serviceId: string,
    count: number,
    label: string,
  ): Promise<void> {
    const rows = Array.from({ length: count }, (_, index) => {
      const date = new Date(Date.UTC(2099, 0, 1 + index));
      const iso = date.toISOString().slice(0, 10);
      return {
        business_id: businessId,
        service_id: serviceId,
        client_name: `${label} klient ${index + 1}`,
        client_email: `${label}-${index + 1}@example.test`,
        starts_at: `${iso}T08:00:00Z`,
        ends_at: `${iso}T08:30:00Z`,
        status: 'approved' as const,
      };
    });

    const { error } = await admin.from('reservations').insert(rows);
    if (error) {
      throw new Error('Nepodařilo se vytvořit rezervace.');
    }
  }

  beforeAll(async () => {
    admin = getServiceRoleClient();

    const ownerSeed = await seedBusiness('owner');
    const foreignSeed = await seedBusiness('foreign');

    ownerBusinessId = ownerSeed.businessId;

    await seedReservations(ownerSeed.businessId, ownerSeed.serviceId, OWNER_RESERVATION_COUNT, 'owner');
    await seedReservations(
      foreignSeed.businessId,
      foreignSeed.serviceId,
      FOREIGN_RESERVATION_COUNT,
      'foreign',
    );

    owner = await signInAsUser(ownerSeed.email, TEST_PASSWORD);
  });

  afterAll(async () => {
    for (const businessId of createdBusinessIds) {
      await admin.from('businesses').delete().eq('id', businessId);
    }
    for (const userId of createdUserIds) {
      await admin.from('users').delete().eq('id', userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it('export přečte všechny vyfiltrované řádky bez ohledu na limit stránky a jen vlastní podnik', async () => {
    // Čtení VŠECH vyfiltrovaných řádků po dávkách (jako exportReservationsCsv).
    type ExportRow = Parameters<typeof generateCsvLines>[0] extends Iterable<infer R> ? R : never;
    const rows: ExportRow[] = [];
    for (let offset = 0; ; offset += FETCH_BATCH_SIZE) {
      const { data, error } = await owner
        .from('reservations')
        .select(SELECT_COLUMNS)
        .eq('business_id', ownerBusinessId)
        .gte('starts_at', '2099-01-01T00:00:00Z')
        .order('starts_at', { ascending: true })
        .range(offset, offset + FETCH_BATCH_SIZE - 1)
        .returns<ExportRow[]>();

      expect(error).toBeNull();
      rows.push(...(data ?? []));
      if ((data ?? []).length < FETCH_BATCH_SIZE) {
        break;
      }
    }

    // Úplnost: export obsahuje všechny rezervace majitele (nad limit stránky — R17.5).
    expect(rows.length).toBe(OWNER_RESERVATION_COUNT);
    expect(rows.length).toBeGreaterThan(RESERVATIONS_PAGE_SIZE);

    // CSV generuje REÁLNÝ helper: 1 hlavička + N datových řádků.
    const lines = Array.from(generateCsvLines(rows));
    expect(lines[0]).toBe(CSV_COLUMNS.join(','));
    expect(lines.length).toBe(OWNER_RESERVATION_COUNT + 1);

    // Kontrast: jedna „stránka" seznamu je omezená na 100 řádků (UI stránkování).
    const { data: page } = await owner
      .from('reservations')
      .select('id')
      .eq('business_id', ownerBusinessId)
      .order('starts_at', { ascending: true })
      .range(0, RESERVATIONS_PAGE_SIZE - 1);
    expect((page ?? []).length).toBe(RESERVATIONS_PAGE_SIZE);
  });

  it('export pod JWT majitele nevidí rezervace cizího podniku (R17.4)', async () => {
    // RLS izoluje řádky na podnik majitele — cizí rezervace jsou neviditelné.
    const { data, error } = await owner.from('reservations').select('business_id');

    expect(error).toBeNull();
    for (const row of data ?? []) {
      expect(row.business_id).toBe(ownerBusinessId);
    }

    // Pojistka: pokus o explicitní čtení cizího podniku vrátí prázdno.
    const foreignBusinessId = createdBusinessIds.find((id) => id !== ownerBusinessId);
    const { data: foreign } = await owner
      .from('reservations')
      .select('id')
      .eq('business_id', foreignBusinessId as string);
    expect(foreign ?? []).toHaveLength(0);
  });
});
