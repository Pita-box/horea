'use client';

import { usePathname } from 'next/navigation';

const STEP_COUNT = 6;

function getCurrentStep(pathname: string): number {
  const rawStep = pathname.split('/')[2];
  const step = Number(rawStep);

  if (!Number.isInteger(step) || step < 1 || step > STEP_COUNT) {
    return 1;
  }

  return step;
}

export function OnboardingProgress() {
  const pathname = usePathname();
  const currentStep = getCurrentStep(pathname);

  return (
    <header className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-[var(--font-polysans)] text-2xl font-semibold text-[var(--color-rich-violet)]">
          Onboarding
        </h1>
        <p className="shrink-0 text-sm font-semibold text-[var(--color-slate-text)]">
          Krok {currentStep}/{STEP_COUNT}
        </p>
      </div>

      <div
        className="grid h-2 grid-cols-6 gap-2"
        aria-label={`Průběh onboardingu: krok ${currentStep} z ${STEP_COUNT}`}
      >
        {Array.from({ length: STEP_COUNT }, (_, index) => {
          const step = index + 1;
          const isActive = step <= currentStep;

          return (
            <div
              key={step}
              className={[
                'h-2 rounded-full',
                isActive ? 'bg-[var(--color-action-violet)]' : 'bg-[#beb3cb]',
              ].join(' ')}
            />
          );
        })}
      </div>
    </header>
  );
}
