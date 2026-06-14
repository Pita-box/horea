import { describe, expect, it } from 'vitest';

import { decideFreeUserGuard } from '@/lib/auth/free-user-guard';

describe('decideFreeUserGuard', () => {
  it('keeps admins on dashboard', () => {
    expect(
      decideFreeUserGuard({
        pathname: '/dashboard',
        isAdmin: true,
        hasBusiness: false,
        subscriptionStatus: null,
        draftCurrentStep: null,
      }),
    ).toEqual({ kind: 'continue' });
  });

  it('redirects admins away from onboarding', () => {
    expect(
      decideFreeUserGuard({
        pathname: '/onboarding/1',
        isAdmin: true,
        hasBusiness: false,
        subscriptionStatus: null,
        draftCurrentStep: null,
      }),
    ).toEqual({ kind: 'redirect', pathname: '/dashboard' });
  });

  it('redirects users without business and draft to onboarding step 1', () => {
    expect(
      decideFreeUserGuard({
        pathname: '/dashboard',
        isAdmin: false,
        hasBusiness: false,
        subscriptionStatus: null,
        draftCurrentStep: null,
      }),
    ).toEqual({ kind: 'redirect', pathname: '/onboarding/1' });
  });

  it('redirects users without business to first unfinished onboarding step', () => {
    expect(
      decideFreeUserGuard({
        pathname: '/dashboard/settings',
        isAdmin: false,
        hasBusiness: false,
        subscriptionStatus: null,
        draftCurrentStep: 2,
      }),
    ).toEqual({ kind: 'redirect', pathname: '/onboarding/3' });
  });

  it('caps unfinished onboarding redirect at step 6', () => {
    expect(
      decideFreeUserGuard({
        pathname: '/dashboard',
        isAdmin: false,
        hasBusiness: false,
        subscriptionStatus: null,
        draftCurrentStep: 5,
      }),
    ).toEqual({ kind: 'redirect', pathname: '/onboarding/6' });
  });

  it('allows users without business to revisit completed onboarding steps', () => {
    expect(
      decideFreeUserGuard({
        pathname: '/onboarding/1',
        isAdmin: false,
        hasBusiness: false,
        subscriptionStatus: null,
        draftCurrentStep: 2,
      }),
    ).toEqual({ kind: 'continue' });
  });

  it('blocks skipping unfinished onboarding steps', () => {
    expect(
      decideFreeUserGuard({
        pathname: '/onboarding/4',
        isAdmin: false,
        hasBusiness: false,
        subscriptionStatus: null,
        draftCurrentStep: 1,
      }),
    ).toEqual({ kind: 'redirect', pathname: '/onboarding/2' });
  });

  it('keeps users with free subscription on dashboard', () => {
    expect(
      decideFreeUserGuard({
        pathname: '/dashboard',
        isAdmin: false,
        hasBusiness: true,
        subscriptionStatus: 'free',
        draftCurrentStep: null,
      }),
    ).toEqual({ kind: 'continue' });
  });

  it('keeps users with active subscription on dashboard', () => {
    expect(
      decideFreeUserGuard({
        pathname: '/dashboard',
        isAdmin: false,
        hasBusiness: true,
        subscriptionStatus: 'active',
        draftCurrentStep: null,
      }),
    ).toEqual({ kind: 'continue' });
  });

  it('keeps users with grace_period subscription on dashboard overview', () => {
    expect(
      decideFreeUserGuard({
        pathname: '/dashboard',
        isAdmin: false,
        hasBusiness: true,
        subscriptionStatus: 'grace_period',
        draftCurrentStep: null,
      }),
    ).toEqual({ kind: 'continue' });
  });

  // Routy správy rezervací (R1.1–R1.3): /dashboard/reservations a /dashboard/clients (+ podcesty)
  it.each([
    '/dashboard/reservations',
    '/dashboard/reservations/123',
    '/dashboard/clients',
    '/dashboard/clients/abc-123',
  ])('allows active subscription into reservation management path %s', (pathname) => {
    expect(
      decideFreeUserGuard({
        pathname,
        isAdmin: false,
        hasBusiness: true,
        subscriptionStatus: 'active',
        draftCurrentStep: null,
      }),
    ).toEqual({ kind: 'continue' });
  });

  it.each([
    '/dashboard/reservations',
    '/dashboard/clients/abc-123',
  ])('allows grace_period subscription into reservation management path %s', (pathname) => {
    expect(
      decideFreeUserGuard({
        pathname,
        isAdmin: false,
        hasBusiness: true,
        subscriptionStatus: 'grace_period',
        draftCurrentStep: null,
      }),
    ).toEqual({ kind: 'continue' });
  });

  it.each([
    '/dashboard/reservations',
    '/dashboard/reservations/123',
    '/dashboard/clients',
    '/dashboard/clients/abc-123',
  ])('redirects free subscription away from reservation management path %s', (pathname) => {
    expect(
      decideFreeUserGuard({
        pathname,
        isAdmin: false,
        hasBusiness: true,
        subscriptionStatus: 'free',
        draftCurrentStep: null,
      }),
    ).toEqual({ kind: 'redirect', pathname: '/dashboard/plans', search: 'locked=reservations' });
  });

  it.each(['expired', 'deleted_data'] as const)(
    'redirects %s subscription from reservation management to /error',
    (subscriptionStatus) => {
      expect(
        decideFreeUserGuard({
          pathname: '/dashboard/reservations',
          isAdmin: false,
          hasBusiness: true,
          subscriptionStatus,
          draftCurrentStep: null,
        }),
      ).toEqual({ kind: 'redirect', pathname: '/error' });
    },
  );

  it('keeps free subscription on dashboard overview (free-mode přehled)', () => {
    expect(
      decideFreeUserGuard({
        pathname: '/dashboard',
        isAdmin: false,
        hasBusiness: true,
        subscriptionStatus: 'free',
        draftCurrentStep: null,
      }),
    ).toEqual({ kind: 'continue' });
  });

  it('does not treat /dashboard/reservationsX as a reservation management path', () => {
    expect(
      decideFreeUserGuard({
        pathname: '/dashboard/reservationsX',
        isAdmin: false,
        hasBusiness: true,
        subscriptionStatus: 'free',
        draftCurrentStep: null,
      }),
    ).toEqual({ kind: 'continue' });
  });

  it('redirects users with business away from onboarding', () => {
    expect(
      decideFreeUserGuard({
        pathname: '/onboarding/3',
        isAdmin: false,
        hasBusiness: true,
        subscriptionStatus: 'free',
        draftCurrentStep: null,
      }),
    ).toEqual({ kind: 'redirect', pathname: '/dashboard' });
  });

  it('fails closed on missing subscription state', () => {
    expect(
      decideFreeUserGuard({
        pathname: '/dashboard',
        isAdmin: false,
        hasBusiness: true,
        subscriptionStatus: null,
        draftCurrentStep: null,
      }),
    ).toEqual({ kind: 'redirect', pathname: '/error' });
  });

  it('fails closed on unexpected subscription status', () => {
    expect(
      decideFreeUserGuard({
        pathname: '/dashboard',
        isAdmin: false,
        hasBusiness: true,
        subscriptionStatus: 'expired',
        draftCurrentStep: null,
      }),
    ).toEqual({ kind: 'redirect', pathname: '/error' });
  });

  it('fails closed on invalid draft step', () => {
    expect(
      decideFreeUserGuard({
        pathname: '/dashboard',
        isAdmin: false,
        hasBusiness: false,
        subscriptionStatus: null,
        draftCurrentStep: 6,
      }),
    ).toEqual({ kind: 'redirect', pathname: '/error' });
  });

  it('fails closed when evaluation already failed', () => {
    expect(
      decideFreeUserGuard({
        pathname: '/dashboard',
        isAdmin: false,
        hasBusiness: false,
        subscriptionStatus: null,
        draftCurrentStep: null,
        hasEvaluationError: true,
      }),
    ).toEqual({ kind: 'redirect', pathname: '/error' });
  });
});
