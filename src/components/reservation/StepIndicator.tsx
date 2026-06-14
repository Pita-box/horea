'use client';

/**
 * Vodorovný indikátor kroků rezervačního formuláře. Aktivní krok je zvýrazněný,
 * už navštívené (dosažené) kroky jsou klikatelné → návrat na konkrétní vyplněný
 * krok. Budoucí (zatím nedosažené) kroky jsou ztlumené a neklikatelné.
 */
type StepIndicatorProps = {
  /** Krátké popisky kroků (1 na krok). */
  steps: readonly string[];
  /** Aktuální krok (1-based). */
  current: number;
  /** Nejvyšší dosažený krok (1-based) — kroky ≤ této hodnotě jsou klikatelné. */
  maxReached: number;
  onStepClick: (step: number) => void;
};

export function StepIndicator({ steps, current, maxReached, onStepClick }: StepIndicatorProps) {
  return (
    <ol className="flex items-start justify-between gap-1">
      {steps.map((label, index) => {
        const stepNumber = index + 1;
        const isActive = stepNumber === current;
        const isReached = stepNumber <= maxReached;
        const isClickable = isReached && !isActive;

        return (
          <li key={label} className="flex min-w-0 flex-1 flex-col items-center gap-[6px] text-center">
            <button
              type="button"
              onClick={() => {
                if (isClickable) {
                  onStepClick(stepNumber);
                }
              }}
              disabled={!isClickable}
              aria-current={isActive ? 'step' : undefined}
              aria-label={`Krok ${stepNumber}: ${label}`}
              className={[
                'flex h-9 w-9 items-center justify-center rounded-full text-[14px] font-semibold transition-colors',
                isActive
                  ? 'bg-[var(--color-action-violet)] text-white'
                  : isReached
                    ? 'bg-[color-mix(in_srgb,var(--color-action-violet)_14%,white)] text-[var(--color-rich-violet)] hover:bg-[color-mix(in_srgb,var(--color-action-violet)_24%,white)]'
                    : 'bg-[var(--color-soft-gray-fill)] text-[color-mix(in_srgb,var(--color-slate-text)_50%,white)]',
              ].join(' ')}
            >
              {stepNumber}
            </button>
            <span
              className={[
                'text-[12px] leading-tight sm:text-[14px]',
                isActive
                  ? 'font-semibold text-[var(--color-action-violet)]'
                  : 'text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]',
              ].join(' ')}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
