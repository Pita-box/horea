import { Card } from '@/components/ui/card';
import { parseSlugData } from '@/lib/onboarding/data';
import { requireOnboardingStep } from '@/lib/onboarding/steps';
import type { Metadata } from 'next';

import { SlugForm } from './SlugForm';

export const metadata: Metadata = {
  title: 'Vyplňte název podniku | Horea',
  description: 'Druhý krok onboarding wizardu Horea.',
};

type OnboardingSlugPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function OnboardingSlugPage({ searchParams }: OnboardingSlugPageProps) {
  const { draft } = await requireOnboardingStep(2);
  const params = await searchParams;
  const slugData = parseSlugData(draft?.slug_data ?? null);
  const initialBusinessName = slugData?.businessName ?? '';
  const initialSlug = slugData?.slug ?? '';
  const initialMessage =
    params.error === 'slug_taken' ? 'Tento název se mezitím obsadil, zvolte jiný.' : null;

  return (
    <Card
      as="section"
      className="space-y-6 border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
    >
      <div className="space-y-[var(--element-gap)]">
        <p className="text-sm font-semibold text-[var(--color-action-violet)]">Krok 2</p>
        <h2 className="font-[var(--font-polysans)] text-3xl font-semibold text-[var(--color-rich-violet)]">
          Název vašeho podniku
        </h2>
        <p className="text-base leading-7">
          Vyplňte název vašeho podniku, ze kterého po aktivaci účtu vytvoříme vaši unikátní
          rezervační stránku. Tento odkaz pak můžete sdílet se svými klienty.
        </p>
      </div>

      <SlugForm
        initialBusinessName={initialBusinessName}
        initialSlug={initialSlug}
        initialMessage={initialMessage}
      />
    </Card>
  );
}
