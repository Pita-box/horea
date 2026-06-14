/**
 * „Zůstat přihlášen" (remember me).
 *
 * Volba se ukládá do cookie `horea-remember` ('1' = persistentní, '0' = session-only).
 * Server i middleware ji při zápisu Supabase auth cookies čtou a podle ní upravují
 * persistenci:
 *  - remember ON  → ponecháme Supabase default (maxAge/expires) → cookies přežijí zavření prohlížeče.
 *  - remember OFF → odstraníme maxAge/expires → session cookies, které se po zavření prohlížeče smažou.
 *
 * Když cookie chybí (starší relace, jiné toky), výchozí je persistentní (zachování dosavadního chování).
 */
export const REMEMBER_COOKIE = 'horea-remember';

export function isRememberEnabled(value: string | undefined): boolean {
  return value !== '0';
}

export function applyRememberMeToCookieOptions<T extends { maxAge?: number; expires?: Date }>(
  options: T | undefined,
  remember: boolean,
): T {
  const next = { ...(options ?? ({} as T)) };

  if (!remember) {
    delete next.maxAge;
    delete next.expires;
  }

  return next;
}
