/**
 * Strukturovaný logger pro server-side prostředí (Vercel scrapuje stdout).
 *
 * Vypisuje jednu řádku JSON na `stdout` ve formátu:
 *   { timestamp, level, msg, requestId?, userId?, ...ctx }
 *
 * Návrhová pravidla (viz `design.md` *Error Handling*, requirements 20.1, 20.2):
 * - Žádná externí dependency (žádný pino/winston) — Simplicity First.
 * - Citlivé hodnoty se redigují na `[REDACTED]` (rekurzivně, case-insensitive klíče).
 * - Logger NIKDY nesmí vyhodit výjimku — selhání logování nesmí shodit volajícího.
 */

export type LogLevel = 'info' | 'warn' | 'error';

export type LogContext = Record<string, unknown>;

/**
 * Klíče, jejichž hodnoty se vždy nahradí `[REDACTED]` (porovnání case-insensitive,
 * stačí, aby název klíče daný řetězec obsahoval — např. `accessToken` i `authToken`).
 */
const SENSITIVE_KEYS = [
  'password',
  'token',
  'authorization',
  'cookie',
  'secret',
  'apikey',
  'api_key',
];

const REDACTED = '[REDACTED]';

/** Maximální hloubka rekurze při redakci — ochrana před hlubokým/cyklickým grafem. */
const MAX_DEPTH = 8;

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.some((sensitive) => lower.includes(sensitive));
}

/**
 * Rekurzivně projde hodnotu a nahradí citlivé klíče za `[REDACTED]`.
 * Hlídá cyklické reference (`seen`) a maximální hloubku (`MAX_DEPTH`).
 */
function redact(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (depth >= MAX_DEPTH) {
    return '[MAX_DEPTH]';
  }

  if (seen.has(value as object)) {
    return '[CIRCULAR]';
  }
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    result[key] = isSensitiveKey(key) ? REDACTED : redact(val, depth + 1, seen);
  }
  return result;
}

function emit(level: LogLevel, msg: string, ctx?: LogContext): void {
  try {
    const safeCtx = ctx ? (redact(ctx, 0, new WeakSet()) as LogContext) : undefined;
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      msg,
      ...safeCtx,
    };
    process.stdout.write(`${JSON.stringify(entry)}\n`);
  } catch {
    // Logování nesmí nikdy shodit volajícího (např. když JSON.stringify selže).
    // Minimální fallback bez kontextu, který nelze serializovat.
    try {
      const fallback = {
        timestamp: new Date().toISOString(),
        level,
        msg,
        logError: 'serialization_failed',
      };
      process.stdout.write(`${JSON.stringify(fallback)}\n`);
    } catch {
      // Vzdáváme se tiše — logování je best-effort.
    }
  }
}

/**
 * Tenký exportovaný wrapper nad interní `redact` — umožňuje znovupoužití redakce
 * (např. health/cron vrstvou) a přímé property-testování bez změny chování loggeru.
 * Projde kontext a nahradí citlivé klíče za `[REDACTED]` (rekurzivně, case-insensitive,
 * substring match — `CRON_SECRET` obsahuje `secret`, takže je redigován).
 */
export function redactContext(ctx: LogContext): LogContext {
  return redact(ctx, 0, new WeakSet()) as LogContext;
}

export const log = {
  info: (msg: string, ctx?: LogContext): void => emit('info', msg, ctx),
  warn: (msg: string, ctx?: LogContext): void => emit('warn', msg, ctx),
  error: (msg: string, ctx?: LogContext): void => emit('error', msg, ctx),
};
