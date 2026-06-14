import { logoutCurrent } from '@/lib/auth/session';
import { serverLog } from '@/lib/log-server';
import { createClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

async function handleLogout(request: NextRequest) {
  const supabase = await createClient();

  try {
    await logoutCurrent(supabase);
  } catch (error) {
    await serverLog.warn('logout_failed', { error });
  }

  return NextResponse.redirect(new URL('/', request.url));
}

export async function GET(request: NextRequest) {
  return handleLogout(request);
}

export async function POST(request: NextRequest) {
  return handleLogout(request);
}
