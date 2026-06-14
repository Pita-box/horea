import { Card } from '@/components/ui/card';
import { parseHoursData } from '@/lib/onboarding/data';
import { requireOnboardingStep } from '@/lib/onboarding/steps';
import type { Metadata } from 'next';

import { HoursForm } from './HoursForm';

export const metadata: Metadata = {
  title: 'Otevírací doba | Horea',
  description: 'Pátý krok onboarding wizardu Horea.',
};

export default async function OnboardingHoursPage() {
  const { draft } = await requireOnboardingStep(5);
  const initialHours = parseHoursData(draft?.hours_data ?? null);

  return (
    <Card
      as="section"
      className="space-y-6 border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
    >
      <div className="space-y-[var(--element-gap)]">
        <p className="text-sm font-semibold text-[var(--color-action-violet)]">Krok 5</p>
        <h2 className="font-[var(--font-polysans)] text-3xl font-semibold text-[var(--color-rich-violet)]">
          Nastavte otevírací dobu
        </h2>
        <p className="text-base leading-7">
          Klienti si později vyberou termín jen v časech, kdy máte otevřeno.
        </p>
      </div>

      <HoursForm initialHours={initialHours} />
    </Card>
  );
}
