'use client';

import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { useToast } from '@/components/ui/toast';
import type { ServiceRecord } from '@/lib/services/types';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

import { deleteService, getReservationCount } from './actions';

type DeleteServiceDialogProps = {
  service: ServiceRecord;
  onClose: () => void;
};

export function DeleteServiceDialog({ service, onClose }: DeleteServiceDialogProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadCount = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);

    void getReservationCount(service.id).then((result) => {
      if (result.ok) {
        setCount(result.count);
      } else {
        setLoadError(result.message);
      }
      setIsLoading(false);
    });
  }, [service.id]);

  useEffect(() => {
    loadCount();
  }, [loadCount]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
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
        dialog.querySelectorAll<HTMLButtonElement>('button:not([disabled])'),
      );

      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
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
  }, [onClose]);

  function handleConfirm() {
    setDeleteError(null);

    startTransition(() => {
      void deleteService(service.id).then((result) => {
        if (result.ok) {
          showToast('Služba smazána.');
          onClose();
          router.refresh();
          return;
        }

        setDeleteError(result.message);
      });
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(33,22,76,0.72)] px-4 py-8">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-service-title"
        className="flex w-full max-w-[480px] flex-col gap-[var(--spacing-16)] rounded-[var(--radius-cards)] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] p-[var(--card-padding)] text-[var(--color-slate-text)]"
      >
        <h2
          id="delete-service-title"
          className="font-[var(--font-polysans)] text-xl font-semibold text-[var(--color-rich-violet)]"
        >
          Smazat službu „{service.name}“?
        </h2>

        {isLoading ? (
          <p className="text-sm leading-6">Načítám počet rezervací…</p>
        ) : loadError ? (
          <Notice role="alert" variant="error">
            {loadError}
          </Notice>
        ) : (
          <p className="text-sm leading-6">Smazat službu? Smaže se také {count} rezervací.</p>
        )}

        {deleteError ? (
          <Notice role="alert" variant="error">
            {deleteError}
          </Notice>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button
            className="w-full sm:w-auto"
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isPending}
          >
            Zrušit
          </Button>
          {loadError ? (
            <Button
              className="w-full sm:w-auto"
              type="button"
              onClick={loadCount}
              disabled={isLoading}
            >
              Zkusit znovu
            </Button>
          ) : (
            <Button
              className="w-full sm:w-auto"
              type="button"
              onClick={handleConfirm}
              disabled={isLoading || isPending}
            >
              {isPending ? 'Mažu...' : 'Potvrdit'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
