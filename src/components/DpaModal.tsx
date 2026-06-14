'use client';

import { acceptDpaAction } from '@/app/(dashboard)/actions';
import { Button } from '@/components/ui/button';
import { useEffect, useRef } from 'react';

export function DpaModal() {
  const dialogRef = useRef<HTMLDivElement>(null);
  const acceptButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    acceptButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        window.location.href = '/logout';
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>(
          'button:not([disabled]), a[href]',
        ),
      );

      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }

      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(33,22,76,0.72)] px-4 py-8">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dpa-title"
        className="flex max-h-full w-full max-w-[680px] flex-col rounded-[var(--radius-cards)] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] text-[var(--color-slate-text)]"
      >
        <div className="space-y-[var(--element-gap)] border-b border-[var(--color-border-vychozi)] px-[var(--card-padding)] py-6">
          <p className="text-sm font-semibold text-[var(--color-action-violet)]">Aktualizace DPA</p>
          <h2
            id="dpa-title"
            className="font-[var(--font-polysans)] text-2xl font-semibold text-[var(--color-rich-violet)]"
          >
            Potvrďte aktuální smlouvu o zpracování dat
          </h2>
          <p className="text-sm leading-6">
            Bez potvrzení nové verze nelze pokračovat v dashboardu ani onboardingu.
          </p>
        </div>

        <div className="space-y-4 px-[var(--card-padding)] py-6 text-sm leading-6">
          <p>
            Aktualizovali jsme smlouvu o zpracování osobních údajů (DPA), která je nedílnou součástí
            našich Všeobecných obchodních podmínek. Než budete pokračovat, potvrďte prosím její
            aktuální znění.
          </p>
          <p>
            <a
              href="/vseobecne-podminky#sekce-7"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[var(--color-action-violet)] hover:underline"
            >
              Přečíst smlouvu o zpracování osobních údajů (DPA)
            </a>
          </p>
        </div>

        <div className="flex flex-col gap-[var(--element-gap)] border-t border-[var(--color-border-vychozi)] px-[var(--card-padding)] py-6 sm:flex-row sm:justify-end">
          <form action="/logout" method="post">
            <Button type="submit" variant="ghost" className="w-full sm:w-auto">
              Odmítnout
            </Button>
          </form>
          <form action={acceptDpaAction}>
            <Button ref={acceptButtonRef} type="submit" className="w-full sm:w-auto">
              Akceptuji
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
