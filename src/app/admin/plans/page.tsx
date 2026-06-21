import { Card } from '@/components/ui/card';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { loadPlanFeatureMatrix } from '@/lib/plans/feature-matrix';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Metadata } from 'next';

import { PlanFeaturesMatrix } from './PlanFeaturesMatrix';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tarify a funkce | Admin | Horea',
  description: 'Správa matice funkcí pro jednotlivé tarify.',
};

/**
 * Admin správa entitlements (`/admin/plans`) — matice funkce × tarif. Admin zde
 * zapíná/vypíná, které funkce jsou v jakém tarifu dostupné. Přístup chrání
 * Access_Guard middleware (`/admin/*`); data čte service-role klient.
 */
export default async function AdminPlansPage() {
  const matrix = await loadPlanFeatureMatrix(createAdminClient());

  return (
    <div className="flex flex-col gap-[var(--section-gap)]">
      <Card className="overflow-hidden border border-[var(--color-border-vychozi)] p-[var(--card-padding)]">
        <div className="mb-4 flex items-start justify-between gap-2">
          <h1 className="font-[var(--font-polysans)] text-xl font-semibold text-[var(--color-rich-violet)]">
            Matice funkcí a tarifů
          </h1>
          <InfoTooltip text="Která funkce je dostupná v kterém tarifu (Start, Pokročilý, Max). Přepínačem u dané funkce zapneš nebo vypneš její dostupnost pro vybraný tarif; změna se ukládá okamžitě." />
        </div>
        <PlanFeaturesMatrix initialMatrix={matrix} />
      </Card>
    </div>
  );
}
