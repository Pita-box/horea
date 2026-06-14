import 'server-only';

import { Resend, type CreateEmailResponse } from 'resend';

export const DEFAULT_RESEND_FROM_EMAIL = 'Horea <onboarding@resend.dev>';

type SendEmailBaseInput = {
  from?: string;
  to: string | string[];
  subject: string;
  replyTo?: string | string[];
};

type SendEmailInput =
  | (SendEmailBaseInput & { html: string; text?: string })
  | (SendEmailBaseInput & { text: string; html?: string });

let resendClient: Resend | null = null;

function requireEnv(name: 'RESEND_API_KEY'): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export function getResendClient(): Resend {
  resendClient ??= new Resend(requireEnv('RESEND_API_KEY'));

  return resendClient;
}

export function getResendFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL || DEFAULT_RESEND_FROM_EMAIL;
}

export function sendEmail(input: SendEmailInput): Promise<CreateEmailResponse> {
  return getResendClient().emails.send({
    ...input,
    from: input.from ?? getResendFromEmail(),
  });
}
