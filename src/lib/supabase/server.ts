import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { applyRememberMeToCookieOptions, isRememberEnabled, REMEMBER_COOKIE } from './remember-me';

function requirePublicEnv(
  name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    requirePublicEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requirePublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            const remember = isRememberEnabled(cookieStore.get(REMEMBER_COOKIE)?.value);
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, applyRememberMeToCookieOptions(options, remember));
            });
          } catch {
            // Server Components cannot always write cookies; middleware refresh handles auth state.
          }
        },
      },
    },
  );
}
