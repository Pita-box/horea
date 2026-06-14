import type { ReactNode } from 'react';

import { AuthHeader } from '@/components/auth/AuthHeader';
import { PublicFooter } from '@/components/landing/PublicFooter';

/**
 * Sdílený shell pro auth stránky (verify-email, registrace, přihlášení, …).
 * Poskytuje jednotnou hlavičku (logo → /, support ikona → /kontakt), dekorativní
 * blurred blobs na pozadí (sunset-pink nahoře vlevo, lush-green dole vpravo) a
 * naši `PublicFooter`. Obsah (`children`) si řídí vlastní šířku přes `mx-auto max-w-…`.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-cloud-mist)] text-[var(--color-slate-text)]">
      <AuthHeader />

      <main className="relative flex flex-1 items-center justify-center overflow-hidden py-16">
        {/* Dekorativní pozadí (jemné, bez interakce) */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-[8%] top-[12%] h-64 w-64 rounded-full bg-[var(--color-sunset-pink)] opacity-30 blur-3xl" />
          <div className="absolute bottom-[10%] right-0 h-72 w-[77svw] rounded-full bg-[var(--color-lush-green)] opacity-25 blur-3xl" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-[1200px] px-[16px] md:px-10">
          {children}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
