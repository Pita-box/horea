'use server';

import { getPasswordMessage } from '@/lib/auth/messages';
import { validatePassword } from '@/lib/auth/password';
import { logoutAllSessions } from '@/lib/auth/session';
import { serverLog } from '@/lib/log-server';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

import type { ResetPasswordState } from './state';

const RESET_SYSTEM_ERROR = 'Heslo se nepodařilo změnit. Zkuste to prosím znovu.';

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function systemErrorState(): ResetPasswordState {
  return {
    message: RESET_SYSTEM_ERROR,
    fieldErrors: {},
  };
}

export async function resetPasswordAction(formData: FormData): Promise<ResetPasswordState> {
  const password = getString(formData, 'password');
  const passwordConfirm = getString(formData, 'passwordConfirm');

  const passwordResult = validatePassword(password);
  if (!passwordResult.ok) {
    const message = getPasswordMessage(passwordResult.reason);
    return {
      message,
      fieldErrors: {
        password: message,
      },
    };
  }

  if (password !== passwordConfirm) {
    const message = 'Hesla se neshodují.';
    return {
      message,
      fieldErrors: {
        passwordConfirm: message,
      },
    };
  }

  const supabase = await createClient();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    await serverLog.warn('reset_password_missing_session', { error: sessionError });
    return systemErrorState();
  }

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    await serverLog.warn('reset_password_update_failed', { error: updateError });
    return systemErrorState();
  }

  try {
    await logoutAllSessions(session.access_token);
  } catch (error) {
    await serverLog.error('reset_password_logout_all_failed', { error });
    await supabase.auth.signOut();
  }

  redirect('/login?flash=password_updated');
}
