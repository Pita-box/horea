import { Card } from '@/components/ui/card';
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
        <PlanFeaturesMatrix initialMatrix={matrix} />
      </Card>
    </div>
  );
}
