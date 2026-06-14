import { IconHeadset } from '@tabler/icons-react';
import Link from 'next/link';

import { Logo } from '@/components/Logo';

/**
 * Sdílená hlavička pro auth/onboarding stránky: logo vlevo → `/`, support ikona
 * vpravo → `/kontakt`. Sama je transparentní (žádné pozadí), aby pod ní prosvítalo
 * pozadí stránky (cloud-mist v AuthShell, gradient v onboardingu).
 */
export function AuthHeader() {
  return (
    <header className="relative z-20">
      <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-[16px] py-4 md:px-10">
        <Link href="/" className="flex items-center transition-opacity hover:opacity-80">
          <Logo width={92} height={32} priority className="h-8 w-auto" />
          <span className="sr-only">Horea</span>
        </Link>
        <Link
          href="/kontakt"
          aria-label="Kontaktovat podporu"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] text-[var(--color-rich-violet)] transition-colors hover:text-[var(--color-action-violet)]"
        >
          <IconHeadset size={22} stroke={2} aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}
