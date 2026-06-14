export type SubscriptionStatus = 'free' | 'active' | 'grace_period' | 'expired' | 'deleted_data';

export type FreeUserGuardState = {
  pathname: string;
  isAdmin: boolean;
  hasBusiness: boolean;
  subscriptionStatus: SubscriptionStatus | null;
  draftCurrentStep: number | null;
  hasEvaluationError?: boolean;
};

export type FreeUserGuardDecision =
  | { kind: 'continue' }
  | {
      kind: 'redirect';
      pathname: '/dashboard' | '/dashboard/plans' | '/dashboard/subscription' | '/error' | `/onboarding/${number}`;
      /** Query string (bez `?`), např. pro notice na cílové stránce. */
      search?: string;
    };

function isOnboardingPath(pathname: string): boolean {
  return pathname === '/onboarding' || pathname.startsWith('/onboarding/');
}

function isPathOrSubpath(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

function isReservationManagementPath(pathname: string): boolean {
  return (
    isPathOrSubpath(pathname, '/dashboard/reservations') ||
    isPathOrSubpath(pathname, '/dashboard/clients')
  );
}

function parseOnboardingStep(pathname: string): number | null {
  if (!isOnboardingPath(pathname)) {
    return null;
  }

  const step = pathname.split('/')[2];

  if (!step) {
    return null;
  }

  const parsed = Number(step);

  if (!Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
}

function nextOnboardingStep(currentStep: number | null): number | null {
  if (currentStep === null) {
    return 1;
  }

  if (!Number.isInteger(currentStep) || currentStep < 0 || currentStep > 5) {
    return null;
  }

  return Math.min(currentStep + 1, 6);
}

export function decideFreeUserGuard(state: FreeUserGuardState): FreeUserGuardDecision {
  if (state.hasEvaluationError) {
    return { kind: 'redirect', pathname: '/error' };
  }

  if (state.isAdmin) {
    if (isOnboardingPath(state.pathname)) {
      return { kind: 'redirect', pathname: '/dashboard' };
    }

    return { kind: 'continue' };
  }

  if (state.hasBusiness) {
    if (isOnboardingPath(state.pathname)) {
      return { kind: 'redirect', pathname: '/dashboard' };
    }

    const status = state.subscriptionStatus;

    if (isReservationManagementPath(state.pathname)) {
      // Routy správy rezervací — vyžadují aktivní nebo grace_period předplatné (R1.1–1.3).
      if (status === 'active' || status === 'grace_period') {
        return { kind: 'continue' };
      }

      // free vidí přehled, ale ne správu rezervací → redirect na ceník tarifů
      // s notice „odemkněte tuto funkci volbou správného balíčku".
      if (status === 'free') {
        return { kind: 'redirect', pathname: '/dashboard/plans', search: 'locked=reservations' };
      }

      // expired, deleted_data nebo chybějící stav → fail-closed na /error.
      return { kind: 'redirect', pathname: '/error' };
    }

    // Ostatní /dashboard/* (zejména přehled) — free-mode i grace_period mají přístup.
    if (status === 'free' || status === 'active' || status === 'grace_period') {
      return { kind: 'continue' };
    }

    // expired, deleted_data nebo chybějící stav → fail-closed na /error.
    return { kind: 'redirect', pathname: '/error' };
  }

  const nextStep = nextOnboardingStep(state.draftCurrentStep);

  if (nextStep === null) {
    return { kind: 'redirect', pathname: '/error' };
  }

  const target = `/onboarding/${nextStep}` as const;

  if (isOnboardingPath(state.pathname)) {
    const requestedStep = parseOnboardingStep(state.pathname);

    if (requestedStep !== null && requestedStep >= 1 && requestedStep <= nextStep) {
      return { kind: 'continue' };
    }
  }

  return { kind: 'redirect', pathname: target };
}
