import 'server-only';

/**
 * Odesílání přes SMTP2GO HTTP API (v3). Používá se pro vysokoobjemové
 * notifikace rezervací (přes `dispatchTransactionalEmail`), aby kritické auth
 * e-maily zůstaly izolované na Resendu a nesdílely jeho denní limit.
 *
 * Záměrně přes HTTP API (fetch), ne SMTP socket — bez nové závislosti a bez
 * problémů se sokety v serverless prostředí.
 */

const SMTP2GO_ENDPOINT = 'https://api.smtp2go.com/v3/email/send';

export type Smtp2goSendInput = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  /** Odesílatel "Name <email>"; default z env. */
  sender?: string;
};

export type Smtp2goSendResult =
  | { ok: true }
  | { ok: false; error: { code: string; statusCode?: number } };

/** SMTP2GO je nakonfigurováno, jen pokud je k dispozici API klíč. */
export function isSmtp2goConfigured(): boolean {
  return Boolean(process.env.SMTP2GO_API_KEY);
}

function getSmtp2goSender(): string {
  return process.env.SMTP2GO_FROM_EMAIL || 'Horea <noreply@horea.cz>';
}

export async function sendViaSmtp2go(input: Smtp2goSendInput): Promise<Smtp2goSendResult> {
  const apiKey = process.env.SMTP2GO_API_KEY;
  if (!apiKey) {
    return { ok: false, error: { code: 'smtp2go_not_configured' } };
  }

  let response: Response;
  try {
    response = await fetch(SMTP2GO_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Smtp2go-Api-Key': apiKey,
      },
      body: JSON.stringify({
        sender: input.sender ?? getSmtp2goSender(),
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        html_body: input.html,
        text_body: input.text,
      }),
    });
  } catch {
    return { ok: false, error: { code: 'network_error' } };
  }

  if (!response.ok) {
    return { ok: false, error: { code: 'http_error', statusCode: response.status } };
  }

  const payload = (await response.json().catch(() => null)) as {
    data?: { succeeded?: number; error_code?: string };
  } | null;

  const succeeded = payload?.data?.succeeded;
  if (typeof succeeded === 'number' && succeeded > 0) {
    return { ok: true };
  }

  return {
    ok: false,
    error: { code: payload?.data?.error_code ?? 'send_failed', statusCode: response.status },
  };
}
