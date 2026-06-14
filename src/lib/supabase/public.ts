import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Veřejný (anon) Supabase klient BEZ cookies.
 *
 * Proč samostatný klient a ne `createClient` ze `server.ts`: serverový klient
 * čte cookies přes `next/headers`, čímž zdynamičtí ISR routu (Next.js ji označí
 * za dynamickou). Veřejné čtení pod anon klíčem ale žádný uživatelský kontext
 * nepotřebuje — profil podniku, otevírací dobu i sloty čteme bez session.
 *
 * `persistSession: false` + `autoRefreshToken: false`: klient je bezstavový,
 * neukládá žádnou session ani neobnovuje token (anon JWT z env stačí). Tím
 * zůstává čtení statické a ISR-friendly (R15.2, R15.3).
 */
function requirePublicEnv(
  name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export function createPublicClient() {
  return createSupabaseClient(
    requirePublicEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requirePublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
