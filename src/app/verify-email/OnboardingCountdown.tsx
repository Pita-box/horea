'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type OnboardingCountdownProps = {
  redirectTo: string;
  seconds?: number;
};

export function OnboardingCountdown({ redirectTo, seconds = 8 }: OnboardingCountdownProps) {
  const router = useRouter();
  const [remainingSeconds, setRemainingSeconds] = useState(seconds);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRemainingSeconds((current) => Math.max(current - 1, 0));
    }, 1000);
    const timeout = window.setTimeout(() => {
      router.replace(redirectTo);
    }, seconds * 1000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [redirectTo, router, seconds]);

  return (
    <div className="space-y-4 text-sm leading-6 text-[var(--color-slate-text)]">
      <p>Za {remainingSeconds} sekund vás automaticky přesměrujeme do nastavení vašeho podniku.</p>
      <Link
        className="inline-flex h-10 w-full items-center justify-center rounded-[var(--radius-buttons)] bg-[var(--color-action-violet)] px-5 py-0 text-sm font-normal leading-none text-[var(--color-canvas-white)] transition-colors hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-action-violet)]"
        href={redirectTo}
      >
        Pokračovat do onboardingu
      </Link>
    </div>
  );
}
