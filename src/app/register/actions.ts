'use server';

import { AUTH_MESSAGES, getPasswordMessage } from '@/lib/auth/messages';
import { validateEmail } from '@/lib/auth/email';
import { validatePassword } from '@/lib/auth/password';
import { sendVerificationEmail } from '@/lib/auth/verification-email';
import { recordAcceptance } from '@/lib/dpa/manager';
import { serverLog } from '@/lib/log-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';

import type { RegisterActionState, RegisterField } from './state';

const GENERIC_REGISTER_ERROR = 'Registraci se nepodařilo dokončit. Zkuste to prosím znovu.';

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function isChecked(formData: FormData, key: string): boolean {
  return formData.get(key) === 'on';
}

function errorState(field: RegisterField, message: string): RegisterActionState {
  return {
    message,
    fieldErrors: {
      [field]: message,
    },
  };
}

function genericErrorState(): RegisterActionState {
  return {
    message: GENERIC_REGISTER_ERROR,
    fieldErrors: {},
  };
}

function isDuplicateEmailError(error: {
  code?: string;
  message?: string;
  status?: number;
}): boolean {
  const message = error.message?.toLowerCase() ?? '';

  return (
    error.code === '23505' ||
    error.status === 422 ||
    message.includes('already registered') ||
    message.includes('already exists') ||
    message.includes('duplicate')
  );
}

export async function registerAction(formData: FormData): Promise<RegisterActionState> {
  const email = getString(formData, 'email').trim().toLowerCase();
  const password = getString(formData, 'password');
  const tosAccepted = isChecked(formData, 'tosAccepted');
  const dpaAccepted = isChecked(formData, 'dpaAccepted');

  if (!tosAccepted) {
    return errorState('tosAccepted', AUTH_MESSAGES.missingTerms);
  }

  if (!dpaAccepted) {
    return errorState('dpaAccepted', AUTH_MESSAGES.missingDpa);
  }

  if (!validateEmail(email)) {
    return errorState('email', AUTH_MESSAGES.invalidEmail);
  }

  const passwordResult = validatePassword(password);
  if (!passwordResult.ok) {
    return errorState('password', getPasswordMessage(passwordResult.reason));
  }

  const adminClient = createAdminClient();

  const { data: existingUser, error: existingUserError } = await adminClient
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existingUserError) {
    await serverLog.error('register_existing_user_lookup_failed', { error: existingUserError });
    return genericErrorState();
  }

  if (existingUser) {
    return errorState('email', AUTH_MESSAGES.duplicateEmail);
  }

  // Vytváříme uživatele přes Admin API s `email_confirm: false`, takže Supabase
  // NEPOSÍLÁ svůj vestavěný potvrzovací e-mail. Potvrzovací odkaz posíláme sami
  // přes `sendVerificationEmail` (generateLink + Resend) — díky tomu máme vlastní
  // token a vlastní stránku „Aktivovaný účet".
  const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
  });

  if (createError) {
    if (isDuplicateEmailError(createError)) {
      return errorState('email', AUTH_MESSAGES.duplicateEmail);
    }

    await serverLog.error('register_signup_failed', { error: createError });
    return genericErrorState();
  }

  const user = createData.user;
  if (!user) {
    await serverLog.error('register_signup_failed', { error: 'no_user_returned' });
    return genericErrorState();
  }

  const { error: profileError } = await adminClient.from('users').insert({
    id: user.id,
    email,
    is_admin: false,
  });

  if (profileError) {
    if (isDuplicateEmailError(profileError)) {
      return errorState('email', AUTH_MESSAGES.duplicateEmail);
    }

    await serverLog.error('register_profile_create_failed', {
      error: profileError,
      userId: user.id,
    });
    return genericErrorState();
  }

  try {
    await recordAcceptance(user.id);
  } catch (error) {
    await serverLog.error('register_dpa_acceptance_failed', { error, userId: user.id });
    return genericErrorState();
  }

  // Supabase má vypnuté odesílání e-mailů — potvrzovací odkaz posíláme sami přes Resend.
  // Selhání odeslání neblokuje registraci; uživatel může použít formulář pro znovuzaslání.
  const verificationResult = await sendVerificationEmail(email);
  if (!verificationResult.ok) {
    await serverLog.warn('register_verification_email_failed', { userId: user.id });
  }

  redirect('/verify-email');
}
