import 'server-only';

import { Resend } from 'resend';

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
