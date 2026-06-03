import 'server-only';

import { headers } from 'next/headers';

import { log, type LogContext } from './log';

async function withRequestId(ctx?: LogContext): Promise<LogContext | undefined> {
  const headerStore = await headers();
  const requestId = headerStore.get('x-request-id') ?? undefined;

  if (!requestId) {
    return ctx;
  }

  return {
    ...ctx,
    requestId,
  };
}

export const serverLog = {
  info: async (msg: string, ctx?: LogContext): Promise<void> => {
    log.info(msg, await withRequestId(ctx));
  },
  warn: async (msg: string, ctx?: LogContext): Promise<void> => {
    log.warn(msg, await withRequestId(ctx));
  },
  error: async (msg: string, ctx?: LogContext): Promise<void> => {
    log.error(msg, await withRequestId(ctx));
  },
};
