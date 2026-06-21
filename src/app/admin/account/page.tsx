import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { Card } from '@/components/ui/card';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { AccountCredentialsForm } from '@/app/(dashboard)/dashboard/account/AccountCredentialsForm';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Nastavení účtu | Horea',
  description: 'Změna e-mailu a hesla administrátorského účtu.',
};

/**
 * Nastavení administrátorského účtu — změna e-mailu a hesla. Sdílí formulář
 * `AccountCredentialsForm` i serverové akce s owner účtem (akce pracují nad
 * přihlášeným uživatelem bez ohledu na roli). Přístup chrání Access_Guard
 * middleware (`/admin/*`).
 */
export default async function AdminAccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex flex-col gap-6">
      <Card
        as="section"
        className="relative border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
      >
        <div className="absolute right-[var(--card-padding)] top-[var(--card-padding)]">
          <InfoTooltip text="Tady si změníš přihlašovací e-mail a heslo svého admin účtu. Po změně hesla se z bezpečnostních důvodů odhlásí všechna zařízení." />
        </div>
        <AccountCredentialsForm initialEmail={user.email ?? ''} />
      </Card>
    </div>
  );
}
