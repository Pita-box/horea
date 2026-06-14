import { decideAdminGuard, isAdminPath } from '@/lib/admin/access-guard';
import { resolveAppUserGuardState } from '@/lib/auth/app-user-guard';
import { decideFreeUserGuard } from '@/lib/auth/free-user-guard';
import { needsReacceptance } from '@/lib/dpa/state';
import { updateSession } from '@/lib/supabase/middleware';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

function requireEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY'): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function createMiddlewareAdminClient() {
  return createSupabaseClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

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

function nextWithSessionState(
  sessionResponse: NextResponse,
  requestHeaders: Headers,
): NextResponse {
  return copySessionState(
    sessionResponse,
    NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    }),
  );
}

function redirectWithSessionState(
  sessionResponse: NextResponse,
  request: NextRequest,
  pathname: string,
  search = '',
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = search;

  return copySessionState(sessionResponse, NextResponse.redirect(url));
}

async function getAppUserGuardState(userId: string) {
  return resolveAppUserGuardState(createMiddlewareAdminClient(), userId);
}

export async function middleware(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  const { response, user } = await updateSession(request, requestHeaders);
  response.headers.set('x-request-id', requestId);

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('redirectTo', `${request.nextUrl.pathname}${request.nextUrl.search}`);

    return copySessionState(response, NextResponse.redirect(loginUrl));
  }

  const guardState = await getAppUserGuardState(user.id);

  if (!guardState) {
    return redirectWithSessionState(response, request, '/error');
  }

  // Access_Guard pro `/admin/*` (feature admin-dashboard, R1.1–R1.3, Property 1).
  // Neautentizovaný požadavek je odbaven dříve výše (`!user` → redirect na login,
  // což odpovídá `redirect-login`). Zde řešíme jen autentizované požadavky:
  // admin → povolit; autentizovaný ne-admin → HTTP 403 s českou hláškou bez
  // jakéhokoli obsahu dashboardu. Větev je oddělená a vrací se z ní brzy, takže
  // chování pro `/dashboard` a `/onboarding` zůstává beze změny.
  if (isAdminPath(request.nextUrl.pathname)) {
    const adminDecision = decideAdminGuard({
      isAuthenticated: true,
      isAdmin: guardState.isAdmin,
    });

    if (adminDecision.kind === 'allow') {
      return nextWithSessionState(response, requestHeaders);
    }

    if (adminDecision.kind === 'forbidden') {
      return copySessionState(
        response,
        new NextResponse(adminDecision.message, {
          status: 403,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        }),
      );
    }

    // redirect-login (neautentizovaný) — v praxi sem nedojdeme, protože `!user`
    // je odbaveno výše; držíme fail-closed redirect na login pro úplnost.
    return redirectWithSessionState(response, request, '/login');
  }

  if (!guardState.isAdmin && needsReacceptance(guardState.dpaVersionAccepted)) {
    requestHeaders.set('x-dpa-mismatch', 'true');
    response.headers.set('x-dpa-mismatch', 'true');
  }

  const decision = decideFreeUserGuard({
    pathname: request.nextUrl.pathname,
    isAdmin: guardState.isAdmin,
    hasBusiness: guardState.hasBusiness,
    subscriptionStatus: guardState.subscriptionStatus,
    draftCurrentStep: guardState.draftCurrentStep,
  });

  if (decision.kind === 'redirect') {
    return redirectWithSessionState(response, request, decision.pathname, decision.search ?? '');
  }

  return nextWithSessionState(response, requestHeaders);
}

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding/:path*', '/admin/:path*'],
};
