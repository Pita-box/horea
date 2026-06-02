import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      className="flex min-h-screen flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
      style={{ background: 'var(--color-canvas-white, #ffffff)' }}
    >
      <p className="text-5xl font-bold" style={{ color: 'var(--color-action-violet, #592eff)' }}>
        404
      </p>
      <h1
        className="text-3xl font-semibold tracking-tight"
        style={{ color: 'var(--color-slate-text, #353241)' }}
      >
        Stránka nenalezena
      </h1>
      <p className="max-w-md text-lg" style={{ color: 'var(--color-slate-text, #353241)' }}>
        Omlouváme se, ale tato stránka neexistuje nebo byla přesunuta.
      </p>
      <Link
        href="/"
        className="mt-2 font-medium hover:underline"
        style={{ color: 'var(--color-action-violet, #592eff)' }}
      >
        Zpět na hlavní stránku
      </Link>
    </main>
  );
}
