import type { InputHTMLAttributes } from 'react';

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <span
      className={['relative mt-[3px] inline-flex h-[16px] w-[16px] shrink-0', className]
        .filter(Boolean)
        .join(' ')}
    >
      <input
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
        type="checkbox"
        {...props}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none h-[16px] w-[16px] rounded-[4px] border border-[var(--color-slate-text)] bg-[var(--color-canvas-white)] transition-colors peer-[[aria-invalid=true]:not(:checked)]:bg-[#ffaae642] peer-checked:border-[var(--color-slate-text)] peer-checked:bg-[var(--color-slate-text)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--color-slate-text)] peer-disabled:opacity-50"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-[5px] top-[2px] h-[9px] w-[5px] rotate-45 border-b-2 border-r-2 border-[var(--color-canvas-white)] opacity-0 peer-checked:opacity-100 peer-disabled:opacity-50"
      />
    </span>
  );
}
