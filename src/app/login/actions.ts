'use server';

import { AUTH_MESSAGES } from '@/lib/auth/messages';
import { validateEmail } from '@/lib/auth/email';
import { serverLog } from '@/lib/log-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { REMEMBER_COOKIE } from '@/lib/supabase/remember-me';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import type { LoginActionState } from './state';

const LOGIN_SYSTEM_ERROR = 'Přihlášení se nepodařilo dokončit. Zkuste to prosím znovu.';

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function invalidCredentialsState(): LoginActionState {
  return {
    message: AUTH_MESSAGES.invalidCredentials,
    fieldErrors: {},
    emailNotConfirmed: false,
  };
}

function systemErrorState(): LoginActionState {
  return {
    message: LOGIN_SYSTEM_ERROR,
    fieldErrors: {},
    emailNotConfirmed: false,
  };
}

function isEmailNotConfirmedError(error: { code?: string; message?: string }): boolean {
  const message = error.message?.toLowerCase() ?? '';

  return error.code === 'email_not_confirmed' || message.includes('email not confirmed');
}

function getOnboardingPath(currentStep: number | null | undefined): string {
  if (typeof currentStep !== 'number') {
    return '/onboarding/1';
  }

  const nextStep = Math.min(Math.max(currentStep + 1, 1), 6);
  return `/onboarding/${nextStep}`;
}

async function getPostLoginPath(userId: string): Promise<string | null> {
  const adminClient = createAdminClient();

  const { data: profile, error: profileError } = await adminClient
    .from('users')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle();

  if (profileError || !profile) {
    await serverLog.error('login_profile_lookup_failed', { error: profileError, userId });
    return null;
  }

  if (profile.is_admin === true) {
    return '/dashboard';
  }

  const { data: business, error: businessError } = await adminClient
    .from('businesses')
    .select('id')
    .eq('owner_user_id', userId)
    .maybeSingle();

  if (businessError) {
    await serverLog.error('login_business_lookup_failed', { error: businessError, userId });
    return null;
  }

  if (business) {
    return '/dashboard';
  }

  const { data: draft, error: draftError } = await adminClient
    .from('onboarding_drafts')
    .select('current_step')
    .eq('user_id', userId)
    .maybeSingle();

  if (draftError) {
    await serverLog.warn('login_draft_lookup_failed', { error: draftError, userId });
  }

  return getOnboardingPath(draft?.current_step);
}

export async function loginAction(formData: FormData): Promise<LoginActionState> {
  const email = getString(formData, 'email').trim().toLowerCase();
  const password = getString(formData, 'password');
  const rememberMe = formData.get('rememberMe') === 'on';

  if (!validateEmail(email)) {
    return {
      message: AUTH_MESSAGES.invalidEmail,
      fieldErrors: {
        email: AUTH_MESSAGES.invalidEmail,
      },
      emailNotConfirmed: false,
    };
  }

  if (!password) {
    return invalidCredentialsState();
  }

  // Nastavíme volbu „zůstat přihlášen" PŘED přihlášením, ať ji `setAll` v server
  // klientu zohlední při zápisu auth cookies (remember OFF → session cookies).
  const cookieStore = await cookies();
  cookieStore.set(REMEMBER_COOKIE, rememberMe ? '1' : '0', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...(rememberMe ? { maxAge: 60 * 60 * 24 * 400 } : {}),
  });

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (isEmailNotConfirmedError(error)) {
      return {
        message: AUTH_MESSAGES.emailNotConfirmed,
        fieldErrors: {},
        emailNotConfirmed: true,
      };
    }

    return invalidCredentialsState();
  }

  if (!data.user) {
    return invalidCredentialsState();
  }

  const postLoginPath = await getPostLoginPath(data.user.id);
  if (!postLoginPath) {
    return systemErrorState();
  }

  redirect(postLoginPath);
}
