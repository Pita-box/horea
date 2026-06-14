'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { anonymizeClient } from '@/server/ClientAnonymizer';

type DeleteClientDialogProps = {
  clientId: string;
  clientName: string;
};

/**
 * Potvrzovací dialog GDPR výmazu klienta (R16.1). Po potvrzení volá
 * `Client_Anonymizer` (`anonymizeClient`) a po úspěchu přesměruje na seznam
 * klientů.
 */
export function DeleteClientDialog({ clientId, clientName }: DeleteClientDialogProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  function handleConfirm() {
    setError(null);

    startTransition(() => {
      void anonymizeClient(clientId).then((result) => {
        if (result.ok) {
          router.push('/dashboard/clients');
          router.refresh();
          return;
        }

        setError(result.message);
      });
    });
  }

  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setIsOpen(true)}>
        Smazat klienta (GDPR)
      </Button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(33,22,76,0.72)] px-4 py-8">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-client-title"
            className="flex w-full max-w-[480px] flex-col gap-[var(--spacing-16)] rounded-[var(--radius-cards)] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] p-[var(--card-padding)] text-[var(--color-slate-text)]"
          >
            <h2
              id="delete-client-title"
              className="font-[var(--font-polysans)] text-xl font-semibold text-[var(--color-rich-violet)]"
            >
              Smazat klienta „{clientName}“?
            </h2>

            <p className="text-sm leading-6">
              Tato akce je nevratná. Smaže osobní údaje klienta. Jeho rezervace zůstanou zachovány
              jako anonymizované sloty.
            </p>

            {error ? (
              <Notice role="alert" variant="error">
                {error}
              </Notice>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                className="w-full sm:w-auto"
                type="button"
                variant="ghost"
                onClick={() => setIsOpen(false)}
                disabled={isPending}
              >
                Zrušit
              </Button>
              <Button
                className="w-full sm:w-auto"
                type="button"
                onClick={handleConfirm}
                disabled={isPending}
              >
                {isPending ? 'Mažu…' : 'Smazat klienta'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
