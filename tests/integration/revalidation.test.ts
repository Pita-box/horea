/**
 * Integrační test (VOLITELNÝ) — revalidační volání z CRUD server actions.
 *
 * Ověřuje, že úspěšné CRUD operace (`createService`, `updateService`, `deleteService`,
 * `saveOpeningHours`, `updateSetting`) po zápisu do DB zavolají `revalidatePath('/' + slug)`,
 * a že selhání revalidace neblokuje samotnou DB operaci (best-effort).
 *
 * Čistou jednotku `revalidatePublicPage` (volání + spolknutí výjimky bez DB) pokrývá
 * `src/lib/__tests__/revalidate.test.ts` (úkol 4.2) — zde ji NEDUPLIKUJEME a testujeme
 * pouze DB-závislou cestu přes server actions.
 *
 * `next/cache` a infrastrukturní moduly jsou mockované; data jdou proti reálné testovací DB.
 * Bez nakonfigurovaného testovacího Supabase se blok přeskočí (`describe.skipIf`).
 *
 * _Requirements: 10.1, 10.2, 10.3, 10.4_
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getServiceRoleClient, hasIntegrationEnv } from './supabase-test-client';

const revalidatePathMock = vi.hoisted(() => vi.fn());
// Mutable držák na testovací Supabase klienta, který mock `createClient` vrací actions.
const supabaseHolder = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => supabaseHolder.client,
}));

// Logování je best-effort a není předmětem tohoto testu; mock zároveň zabrání načtení
// `next/headers` mimo request kontext při sběru testů.
vi.mock('@/lib/log-server', () => ({
  serverLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  createService,
  deleteService,
  updateService,
} from '@/app/(dashboard)/dashboard/services/actions';
import { saveOpeningHours } from '@/app/(dashboard)/dashboard/opening-hours/actions';
import { updateSetting } from '@/app/(dashboard)/dashboard/settings/actions';
import type { OpeningHoursWeek } from '@/lib/opening-hours/schema';

const VALID_WEEK: OpeningHoursWeek = [
  { dayOfWeek: 0, closed: false, opensAt: '09:00', closesAt: '17:00' },
  { dayOfWeek: 1, closed: true },
  { dayOfWeek: 2, closed: true },
  { dayOfWeek: 3, closed: true },
  { dayOfWeek: 4, closed: true },
  { dayOfWeek: 5, closed: true },
  { dayOfWeek: 6, closed: true },
];

describe.skipIf(!hasIntegrationEnv)('Revalidace z CRUD server actions', () => {
  let admin: SupabaseClient;
  let userId: string;
  let businessId: string;
  let slug: string;

  async function createServiceRow(name: string): Promise<string> {
    const { data, error } = await admin
      .from('services')
      .insert({ business_id: businessId, name, duration_minutes: 30, price_czk: 100 })
      .select('id')
      .single<{ id: string }>();

    if (error || !data) {
      throw new Error('Nepodařilo se připravit službu.');
    }

    return data.id;
  }

  beforeAll(async () => {
    admin = getServiceRoleClient();
    const unique = crypto.randomUUID().slice(0, 8);
    const email = `reval-${unique}@example.test`;
    slug = `reval-${unique}`;

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: 'Integration-Test-Heslo-123',
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

    const { data: business, error: businessError } = await admin
      .from('businesses')
      .insert({ owner_user_id: userId, slug, name: 'Podnik revalidace', type: 'kadernik' })
      .select('id')
      .single<{ id: string }>();

    if (businessError || !business) {
      throw new Error('Nepodařilo se vytvořit podnik.');
    }

    businessId = business.id;

    // Service-role klient s přepsaným auth.getUser, aby actions viděly přihlášeného majitele.
    const client = getServiceRoleClient();
    (client.auth as unknown as { getUser: () => Promise<unknown> }).getUser = async () => ({
      data: { user: { id: userId } },
      error: null,
    });
    supabaseHolder.client = client;
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

  beforeEach(() => {
    revalidatePathMock.mockReset();
  });

  it('createService po úspěšném zápisu revaliduje veřejnou stránku', async () => {
    const result = await createService({ name: 'Stříhání', durationMinutes: 30, priceCzk: 300 });

    expect(result.ok).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/${slug}`);
  });

  it('updateService po úspěšném zápisu revaliduje veřejnou stránku', async () => {
    const serviceId = await createServiceRow('K úpravě');

    const result = await updateService(serviceId, {
      name: 'Upraveno',
      durationMinutes: 45,
      priceCzk: 400,
    });

    expect(result.ok).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/${slug}`);
  });

  it('deleteService po úspěšném zápisu revaliduje veřejnou stránku', async () => {
    const serviceId = await createServiceRow('Ke smazání');

    const result = await deleteService(serviceId);

    expect(result.ok).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/${slug}`);
  });

  it('saveOpeningHours po úspěšném zápisu revaliduje veřejnou stránku', async () => {
    const result = await saveOpeningHours(VALID_WEEK);

    expect(result.ok).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/${slug}`);
  });

  it('updateSetting po úspěšném zápisu revaliduje veřejnou stránku', async () => {
    const result = await updateSetting('allowParallelSlots', true);

    expect(result.ok).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/${slug}`);
  });

  it('selhání revalidace neblokuje DB operaci', async () => {
    revalidatePathMock.mockImplementation(() => {
      throw new Error('cache failed');
    });

    const result = await createService({
      name: 'Bez revalidace',
      durationMinutes: 60,
      priceCzk: 500,
    });

    // DB zápis proběhl a výsledek je úspěšný i přes selhání revalidace.
    expect(result.ok).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/${slug}`);

    if (result.ok && 'service' in result && result.service) {
      const { data } = await admin
        .from('services')
        .select('id')
        .eq('id', result.service.id)
        .single<{ id: string }>();
      expect(data?.id).toBe(result.service.id);
    }
  });
});
