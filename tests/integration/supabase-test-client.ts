/**
 * Sdílený helper pro VOLITELNÉ integrační testy proti lokálnímu/testovacímu Supabase.
 *
 * Integrační testy potřebují běžící Postgres se schématem projektu (migrace) — typicky
 * lokální Supabase (Docker) nebo provisionovaná test DB v CI. V běžném prostředí
 * (a v defaultním `pnpm test:run` bez Dockeru) tyto proměnné nejsou nastavené, takže
 * `hasIntegrationEnv` je `false` a všechny integrační `describe` bloky se přeskočí.
 *
 * Bezpečnost: tento modul NEČTE ani NELOGUJE žádné tajné hodnoty. Pouze ověřuje
 * přítomnost env proměnných (boolean) a předává je přímo do `createClient`.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Záměrně čteme hodnoty jen lokálně; nikdy je nevypisujeme ani nelogujeme.
const TEST_URL = process.env.SUPABASE_TEST_URL;
const TEST_SERVICE_ROLE_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const TEST_ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY;

/**
 * `true` pouze když je nakonfigurované připojení k testovacímu Supabase pomocí
 * service-role klíče (URL + service-role klíč). Stačí pro testy běžící čistě přes
 * service-role (cascade delete, ověření revalidace přes CRUD actions).
 */
export const hasIntegrationEnv: boolean = Boolean(TEST_URL && TEST_SERVICE_ROLE_KEY);

/**
 * `true` navíc vyžaduje anon klíč — potřebný pro testy RLS izolace, kde se vytváří
 * uživatelsky scoped klient (authenticated role) s reálným JWT.
 */
export const hasRlsIntegrationEnv: boolean = hasIntegrationEnv && Boolean(TEST_ANON_KEY);

const DISABLED_AUTH = {
  autoRefreshToken: false,
  persistSession: false,
} as const;

/**
 * Service-role klient — obchází RLS. Používá se pro setup/teardown dat a pro testy,
 * které RLS nezkoumají (cascade delete, revalidace).
 */
export function getServiceRoleClient(): SupabaseClient {
  if (!TEST_URL || !TEST_SERVICE_ROLE_KEY) {
    throw new Error('Integrační Supabase env (URL + service-role klíč) není nakonfigurované.');
  }

  return createClient(TEST_URL, TEST_SERVICE_ROLE_KEY, { auth: DISABLED_AUTH });
}

/**
 * Anonymní klient (anon klíč) — používá se pouze pro přihlášení testovacího uživatele,
 * abychom získali jeho access token.
 */
export function createAnonClient(): SupabaseClient {
  if (!TEST_URL || !TEST_ANON_KEY) {
    throw new Error('Integrační Supabase anon env (URL + anon klíč) není nakonfigurované.');
  }

  return createClient(TEST_URL, TEST_ANON_KEY, { auth: DISABLED_AUTH });
}

/**
 * Klient s RLS kontextem konkrétního uživatele — předáváme jeho access token v hlavičce
 * Authorization, takže dotazy běží pod rolí `authenticated` a Postgres aplikuje RLS policy.
 */
export function createBearerClient(accessToken: string): SupabaseClient {
  if (!TEST_URL || !TEST_ANON_KEY) {
    throw new Error('Integrační Supabase anon env (URL + anon klíč) není nakonfigurované.');
  }

  return createClient(TEST_URL, TEST_ANON_KEY, {
    auth: DISABLED_AUTH,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/**
 * Přihlásí testovacího uživatele (anon klient + heslo) a vrátí klienta s jeho RLS kontextem.
 */
export async function signInAsUser(email: string, password: string): Promise<SupabaseClient> {
  const anon = createAnonClient();
  const { data, error } = await anon.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    throw new Error('Přihlášení testovacího uživatele selhalo.');
  }

  return createBearerClient(data.session.access_token);
}
