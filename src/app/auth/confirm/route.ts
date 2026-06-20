import { NextResponse, type NextRequest } from 'next/server';

import { serverLog } from '@/lib/log-server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Potvrzení e-mailového odkazu pro obnovu hesla (recovery). Verifikace OTP se
 * dělá zde v Route Handleru záměrně — na rozdíl od Server Componenty umí zapsat
 * session cookies. Před verifikací navíc odhlásíme případnou existující session
 * v tomto prohlížeči (scope `local`), aby obnova proběhla čistě pro vlastníka
 * odkazu a nedošlo k záměně účtů (např. přihlášený účet A vs. odkaz pro účet B).
 *
 * Při úspěchu přesměruje na `/reset-password` (formulář nového hesla už běží nad
 * session vlastníka odkazu). Při neúspěchu na `/reset-password?error=invalid_link`,
 * kde se zobrazí hláška o neplatném odkazu.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const code = searchParams.get('code');

  const supabase = await createClient();

  // Zahodit případnou existující (jinou) session, aby obnova hesla neproběhla
  // omylem nad cizí přihlášenou session. `local` neodvolává tokeny na serveru,
  // takže to neovlivní ostatní zařízení dotčených účtů.
  await supabase.auth.signOut({ scope: 'local' });

  if (tokenHash && type === 'recovery') {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
    if (!error) {
      return NextResponse.redirect(new URL('/reset-password', origin));
    }
    await serverLog.warn('auth_confirm_verify_otp_failed', { error });
  } else if (code) {
    // Zpětná kompatibilita se staršími odkazy s parametrem `?code=`.
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL('/reset-password', origin));
    }
    await serverLog.warn('auth_confirm_code_exchange_failed', { error });
  }

  return NextResponse.redirect(new URL('/reset-password?error=invalid_link', origin));
}
