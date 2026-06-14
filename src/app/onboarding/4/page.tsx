import { Card } from '@/components/ui/card';
import { parseServicesData } from '@/lib/onboarding/data';
import { requireOnboardingStep } from '@/lib/onboarding/steps';
import type { Metadata } from 'next';

import { ServicesForm } from './ServicesForm';

export const metadata: Metadata = {
  title: 'Služby | Horea',
  description: 'Čtvrtý krok onboarding wizardu Horea.',
};

export default async function OnboardingServicesPage() {
  const { draft } = await requireOnboardingStep(4);
  const initialServices = parseServicesData(draft?.services_data ?? null);

  return (
    <Card
      as="section"
      className="space-y-6 border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
    >
      <div className="space-y-[var(--element-gap)]">
        <p className="text-sm font-semibold text-[var(--color-action-violet)]">Krok 4</p>
        <h2 className="font-[var(--font-polysans)] text-3xl font-semibold text-[var(--color-rich-violet)]">
          Přidejte první službu
        </h2>
        <p className="text-base leading-7">
          Stačí jedna služba. Další můžete přidat hned teď nebo později v dashboardu.
        </p>
      </div>

      <ServicesForm initialServices={initialServices} />
    </Card>
  );
}
