import { AuthHeader } from '@/components/auth/AuthHeader';
import { DpaModal } from '@/components/DpaModal';
import { PublicFooter } from '@/components/landing/PublicFooter';
import { headers } from 'next/headers';

import { OnboardingProgress } from './OnboardingProgress';

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const headerStore = await headers();
  const showDpaModal = headerStore.get('x-dpa-mismatch') === 'true';

  return (
    <div className="relative flex min-h-screen flex-col text-[var(--color-slate-text)]">
      {/* Full-screen gradient pozadí (fixed, za vším — prosvítá i pod headerem a patičkou) */}
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-action-violet)_14%,white)_0%,var(--color-cloud-mist)_50%,color-mix(in_srgb,var(--color-sunset-pink)_35%,white)_100%)]"
      />

      <AuthHeader />

      <main className="flex-1 px-5 py-8 sm:py-12">
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-[var(--section-gap)]">
          <OnboardingProgress />
          {children}
        </div>
      </main>

      <PublicFooter transparent />

      {showDpaModal ? <DpaModal /> : null}
    </div>
  );
}
