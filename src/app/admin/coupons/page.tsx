import { listCoupons } from '@/lib/admin/coupon-manager';
import { createAdminClient } from '@/lib/supabase/admin';

import { CouponsManager } from './coupons-manager';

/**
 * Správa kupónů admin dashboardu `/admin/coupons` (feature `admin-dashboard`,
 * Requirement 7, task 14.2).
 *
 * SSR stránka, která načte seznam kupónů ({@link listCoupons}, vč. počtu použití,
 * R7.4) a předá je interaktivní client komponentě {@link CouponsManager}. Vlastní
 * vytvoření / úprava / deaktivace / smazání běží přes server actions
 * (`./actions.ts`), které ověřují admin oprávnění a předávají actor pro auditní
 * stopu.
 *
 * Přístup je chráněn Access_Guard middlewarem (`/admin/*`), proto stránka
 * předpokládá přihlášeného admina a čte přes service-role klienta.
 */

export const dynamic = 'force-dynamic';

export default async function AdminCouponsPage() {
  const supabase = createAdminClient();
  const coupons = await listCoupons(supabase);

  return (
    <div className="flex flex-col gap-6">
      <CouponsManager coupons={coupons} />
    </div>
  );
}
