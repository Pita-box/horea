import { DashboardChrome } from '@/components/dashboard/DashboardChrome';
import { DpaModal } from '@/components/DpaModal';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const headerStore = await headers();
  const showDpaModal = headerStore.get('x-dpa-mismatch') === 'true';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;
  if (user) {
    const { data: profile } = await createAdminClient()
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle<{ is_admin: boolean }>();
    isAdmin = profile?.is_admin === true;
  }

  return (
    <>
      <DashboardChrome variant={isAdmin ? 'admin' : 'owner'}>{children}</DashboardChrome>
      {showDpaModal ? <DpaModal /> : null}
    </>
  );
}
