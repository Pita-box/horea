'use server';

import { AUTH_MESSAGES } from '@/lib/auth/messages';
import { validateEmail } from '@/lib/auth/email';
import { sendVerificationEmail } from '@/lib/auth/verification-email';
import { serverLog } from '@/lib/log-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

import type { ResendVerificationState } from './state';

const RESEND_MESSAGE = 'Pokud u nás účet existuje, poslali jsme nový potvrzovací odkaz.';
const RESEND_ERROR_MESSAGE = 'Potvrzovací odkaz se nepodařilo odeslat. Zkuste to prosím znovu.';

type VerifyEmailLinkType = 'email' | 'magiclink' | 'signup';

export type VerifyEmailLinkResult =
  | {
      kind: 'success';
      onboardingPath: string;
    }
  | {
      kind: 'expired';
    };

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function successState(): ResendVerificationState {
  return {
    status: 'success',
    message: RESEND_MESSAGE,
    fieldErrors: {},
  };
}

function errorState(message = RESEND_ERROR_MESSAGE): ResendVerificationState {
  return {
    status: 'error',
    message,
    fieldErrors: {},
  };
}

function getOnboardingPath(currentStep: number | null | undefined): string {
  if (typeof currentStep !== 'number') {
    return '/onboarding/1';
  }

  const nextStep = Math.min(Math.max(currentStep + 1, 1), 6);
  return `/onboarding/${nextStep}`;
}

function getVerifyType(value: string): VerifyEmailLinkType | null {
  return value === 'email' || value === 'magiclink' || value === 'signup' ? value : null;
}

export async function resendVerificationAction(
  formData: FormData,
): Promise<ResendVerificationState> {
  const email = getString(formData, 'email').trim().toLowerCase();

  if (!validateEmail(email)) {
    return {
      status: 'error',
      message: AUTH_MESSAGES.invalidEmail,
      fieldErrors: {
        email: AUTH_MESSAGES.invalidEmail,
      },
    };
  }

  const adminClient = createAdminClient();
  const { data: profile, error: profileError } = await adminClient
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (profileError) {
    await serverLog.warn('resend_verification_profile_lookup_failed', { error: profileError });
    return errorState();
  }

  if (!profile) {
    return successState();
  }

  const result = await sendVerificationEmail(email);

  if (!result.ok) {
    return errorState(result.errorMessage);
  }

  return successState();
}

export async function verifyEmailLinkAction(
  tokenHash: string,
  rawType: string,
): Promise<VerifyEmailLinkResult> {
  const type = getVerifyType(rawType);

  if (!tokenHash || !type) {
    return { kind: 'expired' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error || !data.user) {
    if (error) {
      await serverLog.warn('verify_email_failed', { error });
    }

    return { kind: 'expired' };
  }

  const { data: draft, error: draftError } = await supabase
    .from('onboarding_drafts')
    .select('current_step')
    .eq('user_id', data.user.id)
    .maybeSingle();

  if (draftError) {
    await serverLog.warn('verify_email_draft_lookup_failed', {
      error: draftError,
      userId: data.user.id,
    });
  }

  return {
    kind: 'success',
    onboardingPath: getOnboardingPath(draft?.current_step),
  };
}

export async function verifyEmailCodeAction(code: string): Promise<VerifyEmailLinkResult> {
  if (!code) {
    return { kind: 'expired' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    if (error) {
      await serverLog.warn('verify_email_code_exchange_failed', { error });
    }

    return { kind: 'expired' };
  }

  const { data: draft, error: draftError } = await supabase
    .from('onboarding_drafts')
    .select('current_step')
    .eq('user_id', data.user.id)
    .maybeSingle();

  if (draftError) {
    await serverLog.warn('verify_email_code_draft_lookup_failed', {
      error: draftError,
      userId: data.user.id,
    });
  }

  return {
    kind: 'success',
    onboardingPath: getOnboardingPath(draft?.current_step),
  };
}
