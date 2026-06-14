import type { InputHTMLAttributes } from 'react';

type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/**
 * Toggle switch postavený nad nativním checkboxem (zachovává chování ve formuláři —
 * name/value/checked/FormData). Vizuál: pill track, posuvný knob; zapnuto = action-violet.
 */
export function Switch({ className, ...props }: SwitchProps) {
  return (
    <span
      className={['relative inline-flex h-6 w-11 shrink-0 items-center', className]
        .filter(Boolean)
        .join(' ')}
    >
      <input
        type="checkbox"
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        {...props}
      />
      <span
        aria-hidden="true"
        className="h-6 w-11 rounded-full bg-[var(--color-input-border)] transition-colors peer-checked:bg-[var(--color-action-violet)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--color-action-violet)] peer-disabled:opacity-50"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0.5 h-5 w-5 rounded-full bg-[var(--color-canvas-white)] shadow transition-transform peer-checked:translate-x-5"
      />
    </span>
  );
}
