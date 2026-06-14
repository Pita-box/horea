'use client';

import { IconAlertTriangle, IconCheck, IconX } from '@tabler/icons-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ToastVariant = 'success' | 'error';

type ToastItem = {
  id: number;
  message: string;
  variant: ToastVariant;
  leaving: boolean;
};

type ToastContextValue = {
  /** Zobrazí vyskakovací oznámení. Výchozí varianta je „success". */
  showToast: (message: string, variant?: ToastVariant) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 3200;
const LEAVE_ANIM_MS = 200;

/**
 * Globální poskytovatel toastů. Obalí obsah a vykreslí fixní viewport vpravo dole.
 * Komponenty uvnitř volají `useToast().showToast('Uloženo')` pro potvrzení akce.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      // Nejdřív přehrajeme leave animaci, pak teprve odebereme z DOM.
      setToasts((current) =>
        current.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)),
      );
      window.setTimeout(() => remove(id), LEAVE_ANIM_MS);
    },
    [remove],
  );

  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'success') => {
      const id = ++idRef.current;
      setToasts((current) => [...current, { id, message, variant, leaving: false }]);
      window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onClose={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onClose }: { toast: ToastItem; onClose: () => void }) {
  const isError = toast.variant === 'error';
  const Icon = isError ? IconAlertTriangle : IconCheck;

  return (
    <div
      role="status"
      className={[
        'pointer-events-auto flex items-start gap-3 rounded-[var(--radius-buttons)] border bg-[var(--color-canvas-white)] p-3 shadow-[0_8px_24px_rgba(33,22,76,0.12)]',
        toast.leaving ? 'animate-toast-out' : 'animate-toast-in',
        isError
          ? 'border-[color-mix(in_srgb,var(--color-neon-pink)_35%,white)]'
          : 'border-[color-mix(in_srgb,var(--color-electric-green)_45%,white)]',
      ].join(' ')}
    >
      <span
        className={[
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
          isError
            ? 'bg-[color-mix(in_srgb,var(--color-neon-pink)_18%,white)] text-[var(--color-neon-pink)]'
            : 'bg-[color-mix(in_srgb,var(--color-electric-green)_30%,white)] text-[var(--color-rich-violet)]',
        ].join(' ')}
      >
        <Icon size={16} stroke={3} aria-hidden="true" />
      </span>
      <p className="flex-1 pt-0.5 text-sm font-medium text-[var(--color-slate-text)]">
        {toast.message}
      </p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Zavřít oznámení"
        className="shrink-0 text-[color-mix(in_srgb,var(--color-slate-text)_55%,white)] transition-colors hover:text-[var(--color-slate-text)]"
      >
        <IconX size={16} stroke={2} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Hook pro zobrazení toastů. Musí být uvnitř `<ToastProvider>`. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast musí být použit uvnitř <ToastProvider>.');
  }
  return ctx;
}
