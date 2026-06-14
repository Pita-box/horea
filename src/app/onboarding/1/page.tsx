import { Card } from '@/components/ui/card';
import { parseTypeData } from '@/lib/onboarding/data';
import { requireOnboardingStep } from '@/lib/onboarding/steps';
import type { Metadata } from 'next';

import { TypeForm } from './TypeForm';

export const metadata: Metadata = {
  title: 'Typ podniku | Horea',
  description: 'První krok onboarding wizardu Horea.',
};

export default async function OnboardingTypePage() {
  const { draft } = await requireOnboardingStep(1);
  const initialType = parseTypeData(draft?.type_data ?? null)?.type ?? null;

  return (
    <Card
      as="section"
      className="space-y-6 border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
    >
      <div className="space-y-[var(--element-gap)]">
        <p className="text-sm font-semibold text-[var(--color-action-violet)]">Krok 1</p>
        <h2 className="font-[var(--font-polysans)] text-3xl font-semibold text-[var(--color-rich-violet)]">
          Vyberte typ podniku
        </h2>
        <p className="text-base leading-7">
          Podle typu podniku později přizpůsobíme výchozí služby, popisky a nastavení profilu.
        </p>
      </div>

      <TypeForm initialType={initialType} />
    </Card>
  );
}
