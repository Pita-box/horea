'use server';

import { validateEmail } from '@/lib/auth/email';
import { getPasswordMessage } from '@/lib/auth/messages';
import { validatePassword } from '@/lib/auth/password';
import { serverLog } from '@/lib/log-server';
import { createClient } from '@/lib/supabase/server';

export type AccountActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

const GENERIC_ERROR = 'Operaci se nepodařilo dokončit. Zkuste to prosím znovu.';

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

/** Aktuální e-mail přihlášeného uživatele (pro předvyplnění formuláře). */
export async function getAccountEmail(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ?? null;
}

/**
 * Změna e-mailu účtu. Supabase odešle potvrzovací odkaz na novou adresu —
 * změna se projeví až po jejím potvrzení.
 */
export async function updateEmailAction(formData: FormData): Promise<AccountActionResult> {
  const email = getString(formData, 'email').trim();

  if (!validateEmail(email)) {
    return { ok: false, message: 'Zadejte platný email.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: 'Přihlaste se prosím znovu.' };
  }

  if (user.email && user.email.toLowerCase() === email.toLowerCase()) {
    return { ok: false, message: 'Toto je váš současný e-mail.' };
  }

  const { error } = await supabase.auth.updateUser({ email });

  if (error) {
    await serverLog.warn('account_email_update_failed', { error });
    return { ok: false, message: GENERIC_ERROR };
  }

  return {
    ok: true,
    message: 'Na novou adresu jsme poslali potvrzovací odkaz. Změna se projeví po jeho potvrzení.',
  };
}

/** Změna hesla přihlášeného uživatele (vyžaduje aktivní relaci). */
export async function updatePasswordAction(formData: FormData): Promise<AccountActionResult> {
  const password = getString(formData, 'password');
  const passwordConfirm = getString(formData, 'passwordConfirm');

  const passwordResult = validatePassword(password);
  if (!passwordResult.ok) {
    return { ok: false, message: getPasswordMessage(passwordResult.reason) };
  }

  if (password !== passwordConfirm) {
    return { ok: false, message: 'Hesla se neshodují.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: 'Přihlaste se prosím znovu.' };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    await serverLog.warn('account_password_update_failed', { error });
    return { ok: false, message: GENERIC_ERROR };
  }

  return { ok: true, message: 'Heslo bylo změněno.' };
}
