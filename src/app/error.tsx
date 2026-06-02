'use client';

type ErrorBoundaryProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  const reference = error.digest;

  return (
    <main className="flex min-h-screen flex-1 flex-col items-center justify-center gap-5 bg-[var(--color-canvas-white)] px-6 text-center text-[var(--color-slate-text)]">
      <div className="max-w-md space-y-3">
        <p className="text-sm font-semibold text-[var(--color-action-violet)]">Chyba</p>
        <h1 className="text-3xl font-semibold text-[var(--color-rich-violet)]">
          Něco se pokazilo.
        </h1>
        <p className="text-base leading-7">Zkuste to prosím znovu.</p>
        {reference ? (
          <p className="text-sm text-[var(--color-slate-text)]">Kód chyby: {reference}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={reset}
        className="rounded-[var(--radius-buttons)] bg-[var(--color-action-violet)] px-5 py-3 text-sm font-medium text-[var(--color-canvas-white)] transition-colors hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-action-violet)]"
      >
        Zkusit znovu
      </button>
    </main>
  );
}
