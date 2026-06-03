import { updateSession } from '@/lib/supabase/middleware';
import { NextResponse, type NextRequest } from 'next/server';

function copySessionState(from: NextResponse, to: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });

  from.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'set-cookie') {
      to.headers.set(key, value);
    }
  });

  return to;
}

export async function middleware(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  const { supabase, response, user } = await updateSession(request, requestHeaders);
  response.headers.set('x-request-id', requestId);

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('redirectTo', `${request.nextUrl.pathname}${request.nextUrl.search}`);

    return copySessionState(response, NextResponse.redirect(loginUrl));
  }

  if (request.nextUrl.pathname.startsWith('/admin')) {
    const { data, error } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (error || data?.is_admin !== true) {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = '/dashboard';
      dashboardUrl.search = '';
      dashboardUrl.searchParams.set('flash', 'admin_required');

      return copySessionState(response, NextResponse.redirect(dashboardUrl));
    }
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*'],
};
